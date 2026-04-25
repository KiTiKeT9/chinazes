import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

let tabSeq = 0;
const nextTabId = () => `t${++tabSeq}`;

const TABS_KEY = (id) => `chinazes:tabs:${id}`;

function loadTabs(service) {
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY(service.id)) || 'null');
    if (raw && Array.isArray(raw.tabs) && raw.tabs.length) {
      const tabs = raw.tabs
        .filter((t) => t && typeof t.url === 'string' && /^https?:\/\//.test(t.url))
        .map((t) => ({
          id: nextTabId(),
          url: t.url,
          title: t.title || service.name,
          favicon: t.favicon || null,
        }));
      if (tabs.length) {
        const activeIdx = Math.max(0, Math.min(raw.activeIndex ?? 0, tabs.length - 1));
        return { tabs, activeId: tabs[activeIdx].id };
      }
    }
  } catch {}
  const t = { id: nextTabId(), url: service.url, title: service.name, favicon: null };
  return { tabs: [t], activeId: t.id };
}

export default function TabbedServiceView({ service, visible, registerRef }) {
  const initial = useRef(loadTabs(service)).current;
  const [tabs, setTabs] = useState(initial.tabs);
  const [activeId, setActiveId] = useState(initial.activeId);

  // Persist tabs (urls + active) on every change.
  useEffect(() => {
    try {
      const payload = {
        tabs: tabs.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon })),
        activeIndex: tabs.findIndex((t) => t.id === activeId),
      };
      localStorage.setItem(TABS_KEY(service.id), JSON.stringify(payload));
    } catch {}
  }, [tabs, activeId, service.id]);

  const webviewRefs = useRef({}); // id -> webview
  const [loadingMap, setLoadingMap] = useState({});

  // Register active webview with parent for reload button.
  useEffect(() => {
    registerRef?.(webviewRefs.current[activeId] || null);
    return () => registerRef?.(null);
  }, [activeId, registerRef]);

  const addTab = useCallback((url) => {
    const t = { id: nextTabId(), url: url || service.url, title: 'New Tab', favicon: null };
    setTabs((arr) => [...arr, t]);
    setActiveId(t.id);
  }, [service.url]);

  const closeTab = useCallback((id) => {
    setTabs((arr) => {
      const idx = arr.findIndex((t) => t.id === id);
      if (idx === -1 || arr.length === 1) return arr;
      const next = arr.filter((t) => t.id !== id);
      if (id === activeId) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveId(next[newIdx].id);
      }
      return next;
    });
    delete webviewRefs.current[id];
  }, [activeId]);

  const patchTab = useCallback((id, patch) => {
    setTabs((arr) => arr.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // Attach events to each webview when it mounts.
  const setupWebview = useCallback((id, wv) => {
    if (!wv) { delete webviewRefs.current[id]; return; }
    webviewRefs.current[id] = wv;

    const onStart = () => setLoadingMap((m) => ({ ...m, [id]: true }));
    const onStop  = () => setLoadingMap((m) => ({ ...m, [id]: false }));
    const onTitle = (e) => patchTab(id, { title: e.title || 'Tab' });
    const onFavicon = (e) => patchTab(id, { favicon: e.favicons?.[0] || null });
    const onNewWindow = (e) => {
      e.preventDefault?.();
      addTab(e.url);
    };
    const onNavigate = (e) => patchTab(id, { url: e.url });

    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('page-title-updated', onTitle);
    wv.addEventListener('page-favicon-updated', onFavicon);
    wv.addEventListener('new-window', onNewWindow);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
  }, [addTab, patchTab]);

  // Mute audio of non-active tabs and non-visible service to prevent background autoplay.
  useEffect(() => {
    Object.entries(webviewRefs.current).forEach(([id, wv]) => {
      if (!wv) return;
      const mute = !visible || id !== activeId;
      try { wv.setAudioMuted?.(mute); } catch {}
    });
  }, [visible, activeId, tabs]);

  return (
    <motion.div
      className="service service--tabbed"
      style={{ display: visible ? 'flex' : 'none' }}
      initial={false}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="tabs">
        <AnimatePresence initial={false}>
          {tabs.map((t) => (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`tab-chip ${t.id === activeId ? 'tab-chip--active' : ''}`}
              onClick={() => setActiveId(t.id)}
              style={{ '--accent': service.accent }}
              title={t.url}
            >
              {t.favicon
                ? <img src={t.favicon} alt="" className="tab-chip__fav" />
                : <span className="tab-chip__fav tab-chip__fav--placeholder" />}
              <span className="tab-chip__title">{t.title}</span>
              {loadingMap[t.id] && <span className="tab-chip__spin" />}
              {tabs.length > 1 && (
                <span
                  className="tab-chip__close"
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                  aria-label="Close tab"
                >×</span>
              )}
            </motion.button>
          ))}
        </AnimatePresence>
        <button
          className="tab-chip tab-chip--new"
          onClick={() => addTab()}
          title="New tab"
          aria-label="New tab"
        >+</button>
      </div>

      <div className="service__webview-wrap">
        {tabs.map((t) => (
          <webview
            key={t.id}
            ref={(el) => setupWebview(t.id, el)}
            src={t.url}
            partition={service.partition}
            allowpopups="true"
            webpreferences="autoplayPolicy=document-user-activation-required"
            style={{
              width: '100%',
              height: '100%',
              display: t.id === activeId ? 'flex' : 'none',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
