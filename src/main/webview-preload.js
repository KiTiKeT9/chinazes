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
      const origGet = navigator.credentials.get?.bind(navigator.credentials);
      navigator.credentials.get = (opts) => {
        // Conditional mediation = passive autofill probe (VK QR, Google login,
        // etc. silently call this to listen for passkey autofill). Rejecting
        // it makes some sites break their auth flow. Return a never-resolving
        // promise instead — the page treats this as "no passkey available".
        if (opts && opts.mediation === 'conditional') {
          return new Promise(() => {});
        }
        // Active passkey requests still get denied so Windows Hello UI never appears.
        return Promise.reject(denyError());
      };
      navigator.credentials.create = () => Promise.reject(denyError());
    }
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false);
      window.PublicKeyCredential.isConditionalMediationAvailable               = () => Promise.resolve(false);
    }
    // navigator.userAgentData — strict sites (Spotify, VK, banks) read this JS
    // API directly to fingerprint the browser. Electron's default leaks
    // "Chromium" + "Not A Brand"; we override with Chrome 135 brand info that
    // matches the Sec-CH-UA headers we rewrite in the main process.
    try {
      const brands = [
        { brand: 'Google Chrome', version: '135' },
        { brand: 'Chromium',      version: '135' },
        { brand: 'Not.A/Brand',   version: '99'  },
      ];
      const fullVersions = brands.map(b => ({ brand: b.brand, version: b.version + '.0.0.0' }));
      const data = {
        brands,
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: (keys) => Promise.resolve({
          architecture: 'x86',
          bitness: '64',
          brands,
          fullVersionList: fullVersions,
          mobile: false,
          model: '',
          platform: 'Windows',
          platformVersion: '15.0.0',
          uaFullVersion: '135.0.0.0',
          wow64: false,
          ...Object.fromEntries((keys || []).map(k => [k, undefined])),
        }),
        toJSON: () => ({ brands, mobile: false, platform: 'Windows' }),
      };
      Object.defineProperty(navigator, 'userAgentData', { value: data, configurable: true });
    } catch {}
    // navigator.userAgent — Google and other sites detect "Electron" in the UA
    // string and block login. We strip it to look like regular Chrome.
    try {
      const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
      Object.defineProperty(navigator, 'userAgent', {
        value: chromeUA,
        writable: false,
        configurable: true,
      });
      // Also override appVersion and platform to match
      Object.defineProperty(navigator, 'appVersion', {
        value: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        writable: false,
        configurable: true,
      });
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        writable: false,
        configurable: true,
      });
      // Google checks vendor and webdriver
      Object.defineProperty(navigator, 'vendor', {
        value: 'Google Inc.',
        writable: false,
        configurable: true,
      });
      Object.defineProperty(navigator, 'webdriver', {
        value: false,
        writable: false,
        configurable: true,
      });
      // Add fake window.chrome object if missing
      if (!window.chrome) {
        window.chrome = {
          loadTimes: () => {},
          csi: () => {},
          app: { isInstalled: false },
        };
      }
      // Set languages like real Chrome
      Object.defineProperty(navigator, 'languages', {
        value: ['ru-RU', 'ru', 'en-US', 'en'],
        writable: false,
        configurable: true,
      });
      // Hardware specs like typical desktop
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        value: 8,
        writable: false,
        configurable: true,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        value: 8,
        writable: false,
        configurable: true,
      });
      // Max touch points (desktop = 0)
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        writable: false,
        configurable: true,
      });
      // PDF viewer plugin (Chrome always has this)
      try {
        const mimeTypes = [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' } },
          { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' } }
        ];
        Object.defineProperty(navigator, 'mimeTypes', {
          value: mimeTypes,
          writable: false,
          configurable: true,
        });
        Object.defineProperty(navigator, 'plugins', {
          value: [
            { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, item: (i) => mimeTypes[i] },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 0 },
          ],
          writable: false,
          configurable: true,
        });
      } catch {}
      // Enhanced chrome object with runtime
      if (window.chrome) {
        window.chrome.runtime = window.chrome.runtime || {
          id: undefined,
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformNaclArch: { MIPS: 'mips', MIPS64: 'mips64', MIPS64EL: 'mips64el', MIPSEL: 'mipsel', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
          RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
          OnConnectEvent: { addListener: () => {} },
          OnMessageEvent: { addListener: () => {} },
          getManifest: () => ({}),
          getURL: (path) => 'chrome-extension://' + path,
        };
        window.chrome.app = window.chrome.app || {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
          getDetails: () => null,
          getIsInstalled: () => false,
        };
        window.chrome.csi = window.chrome.csi || (() => ({ startE: Date.now(), onloadT: Date.now() }));
        window.chrome.loadTimes = window.chrome.loadTimes || (() => ({
          commitLoadTime: Date.now() / 1000,
          connectionInfo: 'h2',
          finishDocumentLoadTime: Date.now() / 1000,
          finishLoadTime: Date.now() / 1000,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: Date.now() / 1000,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          npnNegotiatedTlsVersion: 'TLS 1.3',
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        }));
      }
      // PluginArray and MimeTypeArray prototypes to look real
      try {
        const proto = Object.create(PluginArray.prototype);
        Object.setPrototypeOf(navigator.plugins, proto);
      } catch {}
    } catch {}
  } catch (_) {}
})();`;

// Inject before any page script runs (webFrame runs at preload time).
webFrame.executeJavaScript(stub).catch(() => {});

// ----------------- Notification interceptor -----------------
// Patch window.Notification so every site-fired notification is mirrored to
// the host (renderer) — accumulated in a global notification bell. We still
// dispatch the original Notification so OS-level toasts keep working.
const notifPatch = `(() => {
  try {
    function relay(title, options) {
      try {
        console.log('[Chinazes] notification fired:', title, options);
        window.postMessage({
          __chinazesNotif: true,
          title: String(title || ''),
          body:  options && options.body  ? String(options.body)  : '',
          icon:  options && options.icon  ? String(options.icon)  : '',
          tag:   options && options.tag   ? String(options.tag)   : '',
          ts: Date.now(),
        }, '*');
      } catch (_) {}
    }

    // 1) Patch the classic Notification constructor.
    const O = window.Notification;
    if (O && !O.__chinazesPatched) {
      function N(title, options) {
        relay(title, options);
        try { return new O(title, options); } catch (_) { return null; }
      }
      N.__chinazesPatched = true;
      try { N.requestPermission = O.requestPermission ? O.requestPermission.bind(O) : (() => Promise.resolve('granted')); } catch (_) {}
      try { Object.defineProperty(N, 'permission', { get() { return 'granted'; } }); } catch (_) {}
      try { Object.setPrototypeOf(N.prototype, O.prototype); } catch (_) {}
      try { Object.defineProperty(window, 'Notification', { value: N, writable: true, configurable: true }); } catch (_) {}
    }

    // 2) Patch ServiceWorkerRegistration.showNotification — modern sites
    //    (Telegram Web, Discord, YouTube, VK) use this for push notifications
    //    and the classic Notification patch above never fires for them.
    if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
      const proto = window.ServiceWorkerRegistration.prototype;
      const orig  = proto.showNotification;
      if (orig && !proto.__chinazesPatched) {
        proto.showNotification = function (title, options) {
          relay(title, options);
          try { return orig.call(this, title, options); } catch (_) { return Promise.resolve(); }
        };
        proto.__chinazesPatched = true;
      }
    }

    // 3) Force Notification.permission to 'granted' so sites enable push
    //    subscriptions in the first place.
    try {
      if (window.Notification) {
        Object.defineProperty(window.Notification, 'permission', { get() { return 'granted'; }, configurable: true });
      }
    } catch (_) {}
  } catch (_) {}
})();`;
webFrame.executeJavaScript(notifPatch).catch(() => {});

// ----------------- Page Visibility spoof (background audio) -----------------
// Chromium pauses media via document.visibilityState/hidden when the embedding
// element gets display:none (which we use to switch tabs). VK / YouTube /
// Yandex.Music explicitly listen for visibilitychange and pause playback when
// the document goes hidden — even with `keep-audio-bg` enabled in our settings,
// the *site* still pauses itself. Override these APIs so the page never thinks
// it's hidden.
const visibilityPatch = `(() => {
  try {
    // Override the visibility properties only — sites that *read* document.hidden /
    // visibilityState during their visibilitychange handler will see 'visible' and
    // therefore won't pause playback. We deliberately don't block the event itself
    // (overriding addEventListener globally breaks SPAs and was causing crashes).
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
    // hasFocus → always true so sites think the window is focused.
    try { document.hasFocus = () => true; } catch (_) {}
  } catch (_) {}
})();`;
webFrame.executeJavaScript(visibilityPatch).catch(() => {});

// ----------------- VK debug logging -----------------
// VK auth flow has historically failed inside Electron webviews even with
// extensive Chrome 135 fingerprint spoofing. This block adds noisy diagnostics
// so we can see exactly where id.vk.com / vk.com breaks. Press F12 in the VK
// tab to inspect the [Chinazes/VK] log lines.
const vkDebug = `(() => {
  try {
    if (!/(\\.|^)vk\\.com$/.test(location.hostname) && !location.hostname.endsWith('id.vk.com')) return;
    const tag = '[Chinazes/VK]';
    console.log(tag, 'page boot', location.href, 'UA=', navigator.userAgent);

    // Track navigations / postMessage between iframes (VK uses cross-origin
    // iframes for the QR widget and session swap).
    const origPost = window.postMessage;
    window.addEventListener('message', (e) => {
      try {
        const o = e.origin || '';
        if (o.includes('vk.com') || o.includes('id.vk.com')) {
          console.log(tag, 'message from', o, e.data);
        }
      } catch (_) {}
    }, true);

    // Wrap fetch + XHR for /method/, /auth/, /api endpoints.
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input, init) {
        try {
          const url = typeof input === 'string' ? input : input?.url;
          if (url && /(\\/method\\/|\\/auth\\/|\\/api\\/|\\/login)/i.test(url)) {
            console.log(tag, 'fetch ->', url, init?.method || 'GET');
          }
        } catch (_) {}
        return origFetch.apply(this, arguments);
      };
    }
    const origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (url && /(\\/method\\/|\\/auth\\/|\\/api\\/|\\/login)/i.test(url)) {
          console.log(tag, 'xhr ->', method, url);
        }
      } catch (_) {}
      return origXHROpen.apply(this, arguments);
    };

    // Cookie writes — VK likely sets remixsid / remixstid here on successful auth.
    try {
      const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      if (cookieDescriptor && cookieDescriptor.set) {
        const origSet = cookieDescriptor.set;
        Object.defineProperty(document, 'cookie', {
          get: cookieDescriptor.get,
          set: function (v) {
            try {
              if (/remixsid|remixstid|access_token|sid/.test(String(v))) {
                console.log(tag, 'cookie set:', String(v).split(';')[0]);
              }
            } catch (_) {}
            return origSet.call(this, v);
          },
          configurable: true,
        });
      }
    } catch (_) {}

    console.log(tag, 'debug instrumentation installed');
  } catch (e) { console.warn('[Chinazes/VK] debug install failed:', e); }
})();`;
webFrame.executeJavaScript(vkDebug).catch(() => {});

// Bridge postMessage relay -> sendToHost (preload's window listens to messages
// posted from the page's main world).
window.addEventListener('message', (e) => {
  const d = e?.data;
  if (!d || d.__chinazesNotif !== true) return;
  try {
    ipcRenderer.sendToHost('chinazes:notification', {
      title: d.title || '',
      body: d.body || '',
      icon: d.icon || '',
      tag: d.tag || '',
      ts: d.ts || Date.now(),
      url: location.href,
    });
  } catch {}
});

// ----------------- Telegram Bridge (for AIRI integration) -----------------
const telegramBridge = (function () {
  const isTelegram = location.hostname.includes('web.telegram.org');
  if (!isTelegram) return null;

  function findChatList() {
    return document.querySelector('.chat-list, .ChatsMain, [class*="chat-list"]');
  }

  function findActiveChat() {
    const active = document.querySelector('.chat.active, .ChatInfo, [class*="chat"][class*="active"]');
    return active;
  }

  function extractMessages(chatElement, limit = 50) {
    const messages = [];
    const msgElements = chatElement?.querySelectorAll('.message, .Message, [class*="message"]') || [];
    
    msgElements.forEach((el, idx) => {
      if (idx >= limit) return;
      const textEl = el.querySelector('.message-text, .text-content, [class*="text"]');
      const authorEl = el.querySelector('.message-author, .sender-name, [class*="sender"]');
      const timeEl = el.querySelector('.message-time, .time, [class*="time"]');
      
      messages.push({
        id: el.dataset.id || String(idx),
        text: textEl?.textContent?.trim() || '',
        author: authorEl?.textContent?.trim() || 'Unknown',
        timestamp: timeEl?.textContent?.trim() || '',
        isOutgoing: el.classList.contains('outgoing') || el.classList.contains('message-out'),
      });
    });
    
    return messages;
  }

  function sendMessage(chatId, text) {
    // Try to find and focus input
    const input = document.querySelector('.message-input-field, .NewMessage textarea, [contenteditable="true"]');
    if (!input) return { success: false, error: 'Input not found' };
    
    // Set text
    input.textContent = text;
    input.value = text;
    
    // Trigger input events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Find and click send button
    setTimeout(() => {
      const sendBtn = document.querySelector('.send-button, .btn-send, button[type="submit"]');
      if (sendBtn) sendBtn.click();
    }, 100);
    
    return { success: true };
  }

  function getChatList() {
    const chats = [];
    const chatElements = document.querySelectorAll('.chat, .Chat, [class*="chat-item"]');
    
    chatElements.forEach((el, idx) => {
      const nameEl = el.querySelector('.chat-title, .ChatTitle, [class*="title"]');
      const previewEl = el.querySelector('.chat-preview, .last-message, [class*="preview"]');
      
      if (nameEl) {
        chats.push({
          id: el.dataset.chatId || `chat_${idx}`,
          name: nameEl.textContent?.trim() || 'Unknown',
          preview: previewEl?.textContent?.trim() || '',
        });
      }
    });
    
    return chats;
  }

  // Observer for new messages
  let messageObserver = null;
  function observeMessages(callback) {
    if (messageObserver) messageObserver.disconnect();
    
    const chatContainer = document.querySelector('.messages-container, .MessagesList, .history-inner');
    if (!chatContainer) return;
    
    messageObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList?.contains('message')) {
            const textEl = node.querySelector('.message-text, .text-content');
            const authorEl = node.querySelector('.message-author, .sender-name');
            
            if (textEl) {
              callback({
                type: 'new_message',
                text: textEl.textContent?.trim() || '',
                author: authorEl?.textContent?.trim() || 'Unknown',
                isIncoming: !node.classList.contains('outgoing'),
                chatId: findActiveChat()?.dataset?.id || 'unknown',
              });
            }
          }
        });
      });
    });
    
    messageObserver.observe(chatContainer, { childList: true, subtree: true });
  }

  // Notify Chinazes that Telegram is ready
  try {
    ipcRenderer.sendToHost('telegram:ready', { url: location.href });
  } catch {}

  return {
    getMessages: extractMessages,
    sendMessage,
    listChats: getChatList,
    observeMessages,
    getActiveChat: () => findActiveChat()?.dataset?.id,
  };
})();

// Expose for main process to call via executeJavaScript
try {
  if (typeof contextBridge !== 'undefined' && contextBridge.exposeInMainWorld) {
    contextBridge.exposeInMainWorld('telegramBridge', telegramBridge || {});
  } else {
    window.telegramBridge = telegramBridge || {};
  }
} catch {}

// ----------------- Media bridge -----------------
// Polls the page for the most-relevant <video>/<audio> + navigator.mediaSession
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
  let idleCount = 0;
  function poll() {
    let s;
    try { s = snapshot(); } catch { s = null; }
    if (!s) {
      idleCount++;
      const delay = idleCount > 5 ? 4000 : 1000;
      setTimeout(poll, delay);
      return;
    }
    idleCount = 0;
    const key = JSON.stringify(s);
    if (key !== last) {
      last = key;
      try { ipcRenderer.sendToHost('chinazes:media-state', s); } catch {}
    }
    setTimeout(poll, 1000);
  }
  setTimeout(poll, 500);

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
        case 'search': {
          // Service-specific search
          const host = location.hostname;
          let searchInput = null;
          let searchBtn = null;
          
          if (host.includes('youtube.com')) {
            searchInput = document.querySelector('input#search, input[name="search_query"]');
            searchBtn = document.querySelector('button#search-icon-legacy, button[aria-label*="Search"]');
          } else if (host.includes('spotify.com')) {
            searchInput = document.querySelector('input[data-testid="search-input"], input[placeholder*="Search"]');
          } else if (host.includes('vk.com') || host.includes('vk.ru')) {
            searchInput = document.querySelector('#wall_search, input[placeholder*="Поиск"], input[placeholder*="Search"]');
          }
          
          if (searchInput && cmd.query) {
            searchInput.value = cmd.query;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            if (searchBtn) searchBtn.click();
          }
          break;
        }
        case 'open': {
          if (cmd.url) {
            window.location.href = cmd.url;
          }
          break;
        }
      }
    } catch (e) { console.warn('[media-cmd]', e); }
  });
})();

// YouTube Mini Player button interception
(function youtubeMiniPlayerIntercept() {
  if (!location.hostname.includes('youtube.com')) return;

  let isProcessingMiniPlayer = false;

  function interceptMiniPlayer() {
    // YouTube's mini player button selector
    const miniPlayerBtn = document.querySelector('button[title="Miniplayer" i], button[aria-label*="Miniplayer" i], button[title="Mini player" i], button[aria-label*="Mini player" i], .ytp-miniplayer-button, button[data-tooltip-text*="mini" i]');

    if (miniPlayerBtn && !miniPlayerBtn._chinazesIntercepted) {
      miniPlayerBtn._chinazesIntercepted = true;

      miniPlayerBtn.addEventListener('click', async (e) => {
        if (isProcessingMiniPlayer) return;

        // Get current video URL
        const videoId = new URLSearchParams(window.location.search).get('v');
        const playlistId = new URLSearchParams(window.location.search).get('list');

        if (videoId) {
          e.preventDefault();
          e.stopPropagation();

          isProcessingMiniPlayer = true;

          // Build the mini player URL (current video, miniplayer mode)
          let miniPlayerUrl = `https://www.youtube.com/watch?v=${videoId}`;
          if (playlistId) {
            miniPlayerUrl += `&list=${playlistId}`;
          }

          // Pause the main video before opening mini player
          const video = document.querySelector('video');
          if (video) {
            video.pause();
          }

          // Open mini player through the main process
          try {
            await ipcRenderer.invoke('youtube-miniplayer:open', miniPlayerUrl);
          } catch (err) {
            console.error('[YouTube MiniPlayer] Failed to open:', err);
          }

          // Reset after a short delay
          setTimeout(() => { isProcessingMiniPlayer = false; }, 500);
        }
      }, true);
    }
  }

  // Watch for dynamic button creation
  const startObserving = () => {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(startObserving, 100);
      return;
    }
    
    const observer = new MutationObserver(() => {
      interceptMiniPlayer();
    });
    
    try {
      observer.observe(target, {
        childList: true,
        subtree: true
      });
    } catch (e) {
      console.warn('[MiniPlayer] Observer failed:', e);
    }
    
    // Initial check
    interceptMiniPlayer();
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    startObserving();
  }
})();
