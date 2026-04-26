// Injected via session.setPreloads() into every webview.
// Stubs WebAuthn / passkey APIs so sites that probe `navigator.credentials.get()`
// don't trigger the Windows "Select a passkey" dialog.

const { webFrame, ipcRenderer, contextBridge } = require('electron');

// Expose a tiny bridge inside webview so user plugins (CSS+JS injected via
// applyPlugins) can ask the host app to perform privileged actions like
// downloading a video into the notes folder. We use sendToHost so the request
// reaches the parent <webview>'s host (renderer App), which then forwards via
// the main-IPC bridge.
try {
  // Older webviews have no contextBridge; fall back to direct window prop.
  const guestApi = {
    downloadVideo: (url) => ipcRenderer.sendToHost('chinazes:download-video', url),
    ai: {
      // Plugins can ask the host AI: messages = [{role, content}, ...].
      // Returns a Promise resolving with { reply, model } or rejecting.
      chat: (args) => ipcRenderer.invoke('ai:chat', args || {}),
      getConfig: () => ipcRenderer.invoke('ai:get-config'),
      // Streaming variant. onChunk(deltaText), onDone({error?}). Returns
      // cancel(): unbind listeners (does not abort the upstream request).
      chatStream: (args, onChunk, onDone) => {
        const requestId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const chunkFn = (_e, p) => { if (p?.requestId === requestId && p.delta) { try { onChunk?.(p.delta); } catch {} } };
        const doneFn  = (_e, p) => {
          if (p?.requestId !== requestId) return;
          ipcRenderer.removeListener('ai:stream-chunk', chunkFn);
          ipcRenderer.removeListener('ai:stream-done', doneFn);
          try { onDone?.(p); } catch {}
        };
        ipcRenderer.on('ai:stream-chunk', chunkFn);
        ipcRenderer.on('ai:stream-done', doneFn);
        ipcRenderer.send('ai:chat-stream', { requestId, ...(args || {}) });
        return () => {
          ipcRenderer.removeListener('ai:stream-chunk', chunkFn);
          ipcRenderer.removeListener('ai:stream-done', doneFn);
        };
      },
    },
  };
  if (typeof contextBridge !== 'undefined' && contextBridge.exposeInMainWorld) {
    contextBridge.exposeInMainWorld('chinazesGuest', guestApi);
  } else {
    window.chinazesGuest = guestApi;
  }
} catch {}

const stub = `(() => {
  try {
    const denyError = () => {
      const e = new Error('NotAllowedError');
      e.name = 'NotAllowedError';
      return e;
    };
    if (navigator.credentials) {
      navigator.credentials.get    = () => Promise.reject(denyError());
      navigator.credentials.create = () => Promise.reject(denyError());
    }
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false);
      window.PublicKeyCredential.isConditionalMediationAvailable               = () => Promise.resolve(false);
    }
  } catch (_) {}
})();`;

// Inject before any page script runs (webFrame runs at preload time).
webFrame.executeJavaScript(stub).catch(() => {});

// ----------------- Media bridge -----------------
// Polls the page for the most-relevant <video>/<audio> + navigator.mediaSession
// metadata and forwards it to the host (renderer) via sendToHost. The host
// renders a unified music bar in the TitleBar and can issue commands back
// (play/pause/seek/volume/next/prev).
(function () {
  if (typeof document === 'undefined') return;

  function pickMedia() {
    const all = Array.from(document.querySelectorAll('video, audio'));
    if (!all.length) return null;
    // Prefer one that's actually playing.
    const playing = all.find((m) => !m.paused && m.duration > 0 && !m.muted);
    if (playing) return playing;
    const anyPlaying = all.find((m) => !m.paused && m.duration > 0);
    if (anyPlaying) return anyPlaying;
    // Fallback: longest duration (likely the main player, not ad/preview).
    return all.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0] || null;
  }

  function snapshot() {
    const m = pickMedia();
    const ms = (typeof navigator !== 'undefined' && navigator.mediaSession) ? navigator.mediaSession.metadata : null;
    if (!m && !ms) return null;
    return {
      title: ms?.title || (m ? document.title : ''),
      artist: ms?.artist || '',
      album: ms?.album || '',
      artwork: ms?.artwork && ms.artwork.length ? ms.artwork[ms.artwork.length - 1].src : '',
      paused: m ? m.paused : true,
      currentTime: m ? Math.floor(m.currentTime || 0) : 0,
      duration: m ? Math.floor(m.duration || 0) : 0,
      volume: m ? m.volume : 1,
      muted: m ? m.muted : false,
      hasMedia: !!m,
      hasMetadata: !!ms,
      pageTitle: document.title,
    };
  }

  let last = '';
  setInterval(() => {
    let s;
    try { s = snapshot(); } catch { s = null; }
    if (!s) return;
    const key = JSON.stringify(s);
    if (key === last) return;
    last = key;
    try { ipcRenderer.sendToHost('chinazes:media-state', s); } catch {}
  }, 1000);

  ipcRenderer.on('chinazes:media-cmd', (_e, cmd) => {
    try {
      const m = pickMedia();
      switch (cmd?.action) {
        case 'play':
          if (m && m.paused) m.play().catch(() => {});
          break;
        case 'pause':
          if (m && !m.paused) m.pause();
          break;
        case 'toggle':
          if (m) (m.paused ? m.play().catch(() => {}) : m.pause());
          break;
        case 'seek':
          if (m && typeof cmd.time === 'number' && Number.isFinite(cmd.time)) {
            m.currentTime = Math.max(0, Math.min(m.duration || 0, cmd.time));
          }
          break;
        case 'volume':
          if (m && typeof cmd.value === 'number') {
            m.volume = Math.max(0, Math.min(1, cmd.value));
            m.muted = false;
          }
          break;
        case 'next':
        case 'prev': {
          const sel = cmd.action === 'next'
            ? '[aria-label*="Next" i], [aria-label*="Следующ" i], .ytp-next-button, [data-testid="control-button-skip-forward"], button[data-test-id="player-next-button"], button[data-l*="next" i]'
            : '[aria-label*="Previous" i], [aria-label*="Предыдущ" i], .ytp-prev-button, [data-testid="control-button-skip-back"], button[data-test-id="player-prev-button"], button[data-l*="prev" i]';
          const btn = document.querySelector(sel);
          if (btn) btn.click();
          break;
        }
      }
    } catch (e) { console.warn('[media-cmd]', e); }
  });
})();
