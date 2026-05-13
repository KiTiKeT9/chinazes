import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TitleBar from './components/TitleBar.jsx';
import ServiceView from './components/ServiceView.jsx';
import TabbedServiceView from './components/TabbedServiceView.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import NotesPanel from './components/NotesPanel.jsx';
import UpdateToast from './components/UpdateToast.jsx';
import ScreenSharePicker from './components/ScreenSharePicker.jsx';
import DownloadToast from './components/DownloadToast.jsx';
import AIChatPanel from './components/AIChatPanel.jsx';
import AppsLauncher from './components/AppsLauncher.jsx';
import CoBrowse from './components/CoBrowse.jsx';
import AIriIntegration from './components/AIriIntegration.jsx';
import ZapretPanel from './components/ZapretPanel.jsx';
import OrganizerPanel from './components/OrganizerPanel.jsx';
import { applyTheme, getStoredTheme } from './themes.js';
import { applyUIPrefs, loadUIPrefs, onUIPrefsChange } from './ui-prefs.js';
import { UA_PRESETS, getStoredUA } from './user-agents.js';
import { resolveServices, visibleServices, loadHidden, saveHidden, addCustomService, removeCustomService } from './service-prefs.js';

const ORDER_KEY = 'chinazes:sidebar-order';
const SPLIT_RATIO_KEY = 'chinazes:split-ratio';

// One-shot migration: VK service URL changed from vk.com/ (stripped landing
// where QR auth doesn't complete) to id.vk.com/ (real auth domain). Existing
// users have the old URL cached in localStorage, force-reset it once.
(function migrateVkUrl() {
  try {
    const KEY = 'chinazes:migration:v1.16-vk-mobile';
    if (localStorage.getItem(KEY)) return;
    // Force-clear any cached VK URL — v1.16 switches to m.vk.com (mobile),
    // which has a working web auth flow inside Electron webviews. Previous
    // versions tried vk.com/ and id.vk.com/login, both of which fail.
    localStorage.removeItem('chinazes:last-url:vk');
    localStorage.setItem(KEY, '1');
  } catch {}
})();

function loadSplitRatio() {
  const v = parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) || '0.5');
  return Number.isFinite(v) && v > 0.1 && v < 0.9 ? v : 0.5;
}

function loadOrder(allServices) {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    if (!Array.isArray(saved)) throw new Error();
    // Keep only ids that still exist + append any new services at the end.
    const known = new Set(allServices.map((s) => s.id));
    const filtered = saved.filter((id) => known.has(id));
    for (const s of allServices) if (!filtered.includes(s.id)) filtered.push(s.id);
    return filtered;
  } catch {
    return allServices.map((s) => s.id);
  }
}

export default function App() {
  // Service catalog is dynamic now: built-ins + user-added customs, with hidden filter.
  // `servicesVersion` bumps whenever Settings modifies the catalog so we re-resolve.
  const [servicesVersion, setServicesVersion] = useState(0);
  const allServices = useMemo(() => {
    const list = resolveServices();
    // Inject the Zapret 2 "virtual service" — it's not a webview, but a host for
    // the embedded native Zapret.exe window. Always pinned to the end.
    return [
      ...list,
      { id: 'organizer', name: 'Органайзер', icon: 'organizer', accent: '#06b6d4', virtual: 'organizer' },
      { id: 'zapret',    name: 'Zapret 2',    icon: 'zapret',    accent: '#ffd166', virtual: 'zapret' },
    ];
  }, [servicesVersion]);
  const [hiddenIds, setHiddenIds] = useState(loadHidden);
  const sidebarServices = useMemo(
    () => allServices.filter((s) => !hiddenIds.has(s.id)),
    [allServices, hiddenIds]
  );

  const [order, setOrder] = useState(() => loadOrder(allServices));
  const [active, setActive] = useState(() => loadOrder(allServices)[0]);
  const [secondary, setSecondary] = useState(null); // service id for split-screen right pane
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [resizing, setResizing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [coBrowseOpen, setCoBrowseOpen] = useState(false);
  const [youtubeMiniPlayerOpen, setYoutubeMiniPlayerOpen] = useState(false);
  const [uiPrefs, setUiPrefs] = useState(loadUIPrefs);
  const [proxyState, setProxyState] = useState({
    status: 'disconnected',
    message: '',
    server: null,
    socksPort: 10808,
  });
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [mediaAccent, setMediaAccent] = useState('#5865f2');

  const webviewRefs = useRef({});
  const dragRef = useRef(null);

  useEffect(() => {
    applyTheme(getStoredTheme());
    applyUIPrefs(uiPrefs);
    const off = onUIPrefsChange(setUiPrefs);
    // Apply stored UA preset on app start (before webviews load).
    const stored = getStoredUA();
    const preset = UA_PRESETS.find((p) => p.id === stored) || UA_PRESETS[0];
    window.chinazes?.app?.setUserAgent?.(preset.ua || '');
    return off;
  }, []);

  useEffect(() => {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  }, [order]);

  useEffect(() => {
    if (!window.chinazes) return;
    window.chinazes.proxy.getState().then(setProxyState);
    const off = window.chinazes.proxy.onState(setProxyState);
    return () => off?.();
  }, []);

  // Auto-detect Zapret 2 (winw.exe) in background.
  const [zapretRunning, setZapretRunning] = useState(false);
  useEffect(() => {
    if (!window.chinazes?.zapret) return;
    let cancelled = false;
    async function poll() {
      try {
        const s = await window.chinazes.zapret.status();
        if (!cancelled) setZapretRunning(!!s?.bypassActive);
      } catch {}
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Merge Zapret running state into proxy state for sidear.
  const mergedProxyState = useMemo(() => {
    if (zapretRunning && proxyState.status === 'disconnected') {
      return { ...proxyState, status: 'connected', message: 'Zapret 2 active' };
    }
    return proxyState;
  }, [zapretRunning, proxyState]);

  // Track media playback for background wave animation.
  useEffect(() => {
    function onMedia(ev) {
      const { serviceId, state } = ev.detail || {};
      if (!serviceId || !state) { setMediaPlaying(false); return; }
      const playing = !state.paused && state.duration > 0;
      setMediaPlaying(playing);
      if (playing) {
        const svc = allServices.find((s) => s.id === serviceId);
        if (svc?.accent) setMediaAccent(svc.accent);
      }
    }
    window.addEventListener('chinazes-media-state', onMedia);
    return () => window.removeEventListener('chinazes-media-state', onMedia);
  }, [allServices]);

  // Re-derive `order` whenever new services appear or hidden state changes.
  useEffect(() => {
    setOrder((cur) => {
      const known = new Set(allServices.map((s) => s.id));
      const filtered = cur.filter((id) => known.has(id));
      for (const s of allServices) if (!filtered.includes(s.id)) filtered.push(s.id);
      return filtered;
    });
  }, [allServices]);

  const orderedServices = useMemo(
    () => order
      .map((id) => sidebarServices.find((s) => s.id === id))
      .filter(Boolean),
    [order, sidebarServices]
  );
  const activeSvc = useMemo(
    () => allServices.find((s) => s.id === active) || orderedServices[0] || allServices[0],
    [active, allServices, orderedServices]
  );
  const secondarySvc = useMemo(
    () => (secondary ? allServices.find((s) => s.id === secondary) : null),
    [secondary, allServices]
  );

  // If the active service got hidden / removed, fall back to first visible.
  useEffect(() => {
    if (!sidebarServices.length) return;
    if (!sidebarServices.find((s) => s.id === active)) {
      setActive(sidebarServices[0].id);
    }
    if (secondary && !sidebarServices.find((s) => s.id === secondary)) {
      setSecondary(null);
    }
  }, [sidebarServices, active, secondary]);

  const onToggleHidden = useCallback((id) => {
    setHiddenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveHidden(next);
      return next;
    });
  }, []);
  const onAddCustom = useCallback((entry) => {
    addCustomService(entry);
    setServicesVersion((v) => v + 1);
  }, []);
  const onRemoveCustom = useCallback((id) => {
    removeCustomService(id);
    setServicesVersion((v) => v + 1);
  }, []);

  const reloadActive = useCallback(() => {
    const wv = webviewRefs.current[active];
    if (!wv) return;
    try { wv.reload(); } catch {}
  }, [active]);

  const getActiveWebview = useCallback(() => webviewRefs.current[active] || null, [active]);

  // Check YouTube mini player status on mount
  useEffect(() => {
    if (window.chinazes?.youtubeMiniPlayer?.isOpen) {
      window.chinazes.youtubeMiniPlayer.isOpen().then(setYoutubeMiniPlayerOpen);
    }
  }, []);

  const openYouTubeMiniPlayer = useCallback(async () => {
    try {
      // Get current video URL from active webview if YouTube is active
      let currentUrl = null;
      if (active === 'youtube') {
        const wv = webviewRefs.current[active];
        if (wv && wv.getURL) {
          try {
            currentUrl = wv.getURL();
          } catch (e) {
            // Fallback to youtube.com
            currentUrl = 'https://www.youtube.com/';
          }
        }
      }
      await window.chinazes?.youtubeMiniPlayer?.open(currentUrl);
      setYoutubeMiniPlayerOpen(true);
    } catch (e) {
      console.error('Failed to open YouTube mini player:', e);
    }
  }, [active]);

  // Ctrl+1…9 / Ctrl+0 — quick switch to the N-th service in sidebar order.
  // 1..9 → indices 0..8, 0 → index 9 (10th tab). Ignored when typing in inputs.
  // We listen both on the host window (for keystrokes in the chrome) and via
  // an IPC bridge from main.js (for keystrokes inside webviews).
  useEffect(() => {
    const switchTo = (key) => {
      const idx = key === '0' ? 9 : parseInt(key, 10) - 1;
      const svc = orderedServices[idx];
      if (!svc) return;
      setActive(svc.id);
      if (secondary === svc.id) setSecondary(null);
    };
    const onKey = (e) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      if (e.key < '0' || e.key > '9') return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      e.preventDefault();
      switchTo(e.key);
    };
    window.addEventListener('keydown', onKey);
    const off = window.chinazes?.app?.onHotkey?.(({ key }) => switchTo(key));
    return () => {
      window.removeEventListener('keydown', onKey);
      off?.();
    };
  }, [orderedServices, secondary]);

  // Ctrl+Shift+I / F12 — open DevTools for the currently focused webview.
  useEffect(() => {
    const onKey = (e) => {
      const isDev = (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) || e.key === 'F12';
      if (!isDev) return;
      e.preventDefault();
      const wv = webviewRefs.current[active];
      if (!wv) return;
      try {
        if (wv.isDevToolsOpened?.()) wv.closeDevTools();
        else wv.openDevTools();
      } catch {}
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const onSelectService = useCallback((id, opts = {}) => {
    if (opts.split) {
      // Toggle as secondary. Allow same id as the primary — two independent
      // panes of the same service (different webview ref keys, shared
      // partition/session so login persists).
      setSecondary((cur) => (cur === id && cur !== active ? null : id));
    } else {
      // If clicked id is currently secondary, swap them.
      if (id === secondary) {
        setSecondary(active);
        setActive(id);
      } else {
        setActive(id);
      }
    }
  }, [active, secondary]);

  const closeSecondary = useCallback(() => setSecondary(null), []);

  // Drag-to-resize divider. The transparent overlay (.resize-overlay below) intercepts
  // pointer events while dragging so the embedded <webview> tags don't capture them
  // (which is what was causing the slow / sticky drag).
  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    const container = dragRef.current;
    if (!container) return;
    setResizing(true);
    const rect = container.getBoundingClientRect();
    let lastRatio = splitRatio;
    const onMove = (ev) => {
      const x = ev.clientX - rect.left;
      lastRatio = Math.min(0.85, Math.max(0.15, x / rect.width));
      setSplitRatio(lastRatio);
    };
    const onUp = () => {
      setResizing(false);
      try { localStorage.setItem(SPLIT_RATIO_KEY, String(lastRatio)); } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [splitRatio]);

  return (
    <div
      className="app"
      style={{ '--accent': activeSvc.accent, '--accent-gradient': activeSvc.gradient, '--media-accent': mediaPlaying ? mediaAccent : activeSvc.accent }}
    >
      <div className="app__glow" />
      <TitleBar
        title={secondarySvc ? `${activeSvc.name} ⏐ ${secondarySvc.name}` : activeSvc.name}
        proxyStatus={mergedProxyState.status}
        serverName={mergedProxyState.server?.name}
        onReload={reloadActive}
        onOpenAI={uiPrefs.features.ai ? () => setAiChatOpen(true) : null}
        activeServiceId={active}
        mediaPlaying={mediaPlaying}
      />
      <div className="app__body">
        <Sidebar
          services={orderedServices}
          order={order}
          onReorder={setOrder}
          active={active}
          secondary={secondary}
          onSelect={onSelectService}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenNotes={uiPrefs.features.notes ? () => setNotesOpen(true) : null}
          onOpenAI={uiPrefs.features.ai ? () => setAiChatOpen(true) : null}
          onOpenApps={uiPrefs.features.apps ? () => setAppsOpen(true) : null}
          onOpenCoBrowse={uiPrefs.features.cobrowse ? () => setCoBrowseOpen(true) : null}
          onOpenYouTubeMiniPlayer={openYouTubeMiniPlayer}
          proxyStatus={mergedProxyState.status}
        />
        <main className={`app__content ${secondarySvc ? 'app__content--split' : ''} ${resizing ? 'app__content--resizing' : ''}`} ref={dragRef}>
          {resizing && <div className="resize-overlay" />}
          <div
            className="pane pane--primary"
            style={secondarySvc ? { flex: `0 0 calc(${splitRatio * 100}% - 4px)` } : undefined}
          >
            {allServices.map((svc) => {
              if (svc.virtual === 'zapret') {
                return <ZapretPanel key={svc.id} visible={svc.id === active} onOpenSettings={() => setSettingsOpen(true)} />;
              }
              if (svc.virtual === 'organizer') {
                return <OrganizerPanel key={svc.id} visible={svc.id === active} />;
              }
              const View = svc.tabbed ? TabbedServiceView : ServiceView;
              return (
                <View
                  key={svc.id}
                  service={svc}
                  visible={svc.id === active}
                  registerRef={(el) => { webviewRefs.current[svc.id] = el; }}
                />
              );
            })}
          </div>
          {secondarySvc && (
            <>
              <div
                className="pane-divider"
                onMouseDown={onDividerMouseDown}
                aria-label="Resize panes"
                title="Drag to resize"
              />
              <div className="pane pane--secondary">
                <div className="pane__header">
                  <span className="pane__name">{secondarySvc.name}</span>
                  <button className="pane__close" onClick={closeSecondary} aria-label="Close pane">×</button>
                </div>
                <div className="pane__body">
                  {allServices.map((svc) => {
                    if (svc.id !== secondary) return null;
                    const View = svc.tabbed ? TabbedServiceView : ServiceView;
                    return (
                      <View
                        key={`sec-${svc.id}`}
                        service={{ ...svc, partition: `${svc.partition}` }}
                        visible
                        mediaServiceId={`sec-${svc.id}`}
                        registerRef={(el) => { webviewRefs.current[`sec-${svc.id}`] = el; }}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        proxyState={mergedProxyState}
        allServices={allServices}
        hiddenIds={hiddenIds}
        onToggleHidden={onToggleHidden}
        onAddCustom={onAddCustom}
        onRemoveCustom={onRemoveCustom}
      />
      <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} />
      <AIChatPanel open={aiChatOpen} onClose={() => setAiChatOpen(false)} />
      <AppsLauncher open={appsOpen} onClose={() => setAppsOpen(false)} />
      <CoBrowse open={coBrowseOpen} onClose={() => setCoBrowseOpen(false)} getActiveWebview={getActiveWebview} />
      <UpdateToast />
      <ScreenSharePicker />
      <DownloadToast />
      <AIriIntegration enabled={uiPrefs.features.airi} />
    </div>
  );
}
