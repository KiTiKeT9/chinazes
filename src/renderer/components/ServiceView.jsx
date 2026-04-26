import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { applyPlugins } from '../plugins.js';

// Per-service CSS overrides injected into the webview after page load.
// Used mainly to force a dark color scheme on services that ignore
// `prefers-color-scheme: dark` (e.g. logged-out Gmail).
const SERVICE_CSS = {
  gmail: `
    :root { color-scheme: dark !important; }
    html, body { background: #0e0e10 !important; }
    /* Login pages */
    div[role="main"], .Bs, .nH, .aeI, .aDP, .ar4, .AO, .nv, .no { background: #0e0e10 !important; }
    /* Inbox shell */
    .gb_xd, .gb_Hd, .gb_Bd, .nH.bkK, .nH.aiw, .aiw, .nH.aeJ, .aeJ { background: #0e0e10 !important; }
    /* Generic light surfaces */
    [bgcolor="#ffffff"], [bgcolor="#FFFFFF"] { background-color: #161620 !important; }
    /* Text contrast bumps */
    body, .yW span, .y6 span, .y2 { color: #e6e8ff !important; }
    .yW span { color: rgba(230,232,255,0.62) !important; }
    /* Subject/preview text */
    .bog, .y6, .ar9 { color: #e6e8ff !important; }
    .y2 { color: rgba(230,232,255,0.55) !important; }
    /* Cards / dialogs */
    .Bu, .nv, .no, .Ar, .Am, .I5, .nH.if, .nH.bAw { background: #14141d !important; color: #e6e8ff !important; }
    /* Inputs */
    input, textarea, select { background: #1a1a25 !important; color: #e6e8ff !important; border-color: rgba(255,255,255,0.08) !important; }
    /* Buttons */
    .T-I.T-I-KE { background: #2a2c3d !important; color: #e6e8ff !important; box-shadow: none !important; }
    /* Scrollbars */
    ::-webkit-scrollbar { background: transparent; width: 10px; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 5px; }
  `,
};

const URL_KEY = (id) => `chinazes:last-url:${id}`;

function loadLastUrl(serviceId, fallback) {
  try {
    const u = localStorage.getItem(URL_KEY(serviceId));
    if (u && /^https?:\/\//.test(u)) return u;
  } catch {}
  return fallback;
}

export default function ServiceView({ service, visible, registerRef }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(true);
  // Use the last-known URL (persisted across app restarts) as initial src.
  const initialUrl = useRef(loadLastUrl(service.id, service.url)).current;

  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    registerRef?.(wv);
    const onStart = () => setLoading(true);
    const onStop = () => setLoading(false);
    const onDomReady = () => {
      // Per-service custom CSS injection (e.g. Gmail dark mode).
      try {
        const css = SERVICE_CSS[service.id];
        if (css) wv.insertCSS(css);
      } catch {}
      // Apply enabled user plugins (CSS + JS) for this service.
      applyPlugins(wv, service.id);
    };
    const onIpc = (e) => {
      if (e.channel === 'chinazes:download-video') {
        const url = e.args?.[0];
        if (url) {
          try { window.chinazes?.notes?.downloadVideo?.(url); } catch {}
        }
      } else if (e.channel === 'chinazes:media-state') {
        try {
          window.dispatchEvent(new CustomEvent('chinazes-media-state', {
            detail: { serviceId: service.id, state: e.args?.[0] || null, sender: wv },
          }));
        } catch {}
      } else if (e.channel === 'chinazes:notification') {
        try {
          window.dispatchEvent(new CustomEvent('chinazes-notification', {
            detail: { serviceId: service.id, serviceName: service.name, payload: e.args?.[0] || {} },
          }));
        } catch {}
      }
    };
    const onNavigate = (e) => {
      // Persist last URL so the next app start opens where the user left off.
      try {
        if (e?.url && /^https?:\/\//.test(e.url)) {
          localStorage.setItem(URL_KEY(service.id), e.url);
        }
      } catch {}
      onDomReady();
    };
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('ipc-message', onIpc);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('ipc-message', onIpc);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      registerRef?.(null);
    };
  }, [registerRef, service.id]);

  // Built-in defaults — services where audio should keep playing in background
  // (voice calls, streams, music). Custom services default to `true` (assume
  // user added them for media). Per-service overrides via Settings.
  const KEEP_AUDIO_BG_DEFAULTS = new Set(['discord', 'telegram', 'twitch', 'spotify', 'yamusic']);
  function loadKeepAudioBg(id, isCustom) {
    try {
      const raw = localStorage.getItem(`chinazes:keep-audio-bg:${id}`);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {}
    return isCustom ? true : KEEP_AUDIO_BG_DEFAULTS.has(id);
  }

  // Track whether the user has visited this service at least once. Until then,
  // we keep it muted even if it allows background audio — otherwise auto-play
  // sites (Twitch / Spotify) blare on app launch.
  const wasVisibleRef = useRef(false);
  if (visible) wasVisibleRef.current = true;

  // Re-read pref on every visibility flip and on storage events from Settings.
  const [keepBg, setKeepBg] = useState(() => loadKeepAudioBg(service.id, !!service.custom));
  useEffect(() => {
    const onStorage = (e) => {
      if (!e || e.key === `chinazes:keep-audio-bg:${service.id}`) {
        setKeepBg(loadKeepAudioBg(service.id, !!service.custom));
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('chinazes-prefs-changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('chinazes-prefs-changed', onStorage);
    };
  }, [service.id, service.custom]);

  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    const allowBg = keepBg && wasVisibleRef.current;
    const shouldMute = !visible && !allowBg;
    try { wv.setAudioMuted?.(shouldMute); } catch {}
  }, [visible, keepBg, service.id]);

  return (
    <motion.div
      className="service"
      style={{ display: visible ? 'block' : 'none' }}
      initial={false}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {loading && (
        <motion.div
          className="service__loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ background: service.gradient }}
        >
          <div className="service__spinner" />
        </motion.div>
      )}
      <webview
        ref={ref}
        src={initialUrl}
        partition={service.partition}
        allowpopups="true"
        webpreferences="autoplayPolicy=document-user-activation-required"
        style={{ width: '100%', height: '100%' }}
      />
    </motion.div>
  );
}
