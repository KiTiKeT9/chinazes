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
import { applyTheme, getStoredTheme } from './themes.js';
import { UA_PRESETS, getStoredUA } from './user-agents.js';
import { resolveServices, visibleServices, loadHidden, saveHidden, addCustomService, removeCustomService } from './service-prefs.js';

const ORDER_KEY = 'chinazes:sidebar-order';
const SPLIT_RATIO_KEY = 'chinazes:split-ratio';

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
  const allServices = useMemo(resolveServices, [servicesVersion]);
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
  const [proxyState, setProxyState] = useState({
    status: 'disconnected',
    message: '',
    server: null,
    socksPort: 10808,
  });

  const webviewRefs = useRef({});
  const dragRef = useRef(null);

  useEffect(() => {
    applyTheme(getStoredTheme());
    // Apply stored UA preset on app start (before webviews load).
    const stored = getStoredUA();
    const preset = UA_PRESETS.find((p) => p.id === stored) || UA_PRESETS[0];
    window.chinazes?.app?.setUserAgent?.(preset.ua || '');
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
      style={{ '--accent': activeSvc.accent, '--accent-gradient': activeSvc.gradient }}
    >
      <div className="app__glow" />
      <TitleBar
        title={secondarySvc ? `${activeSvc.name} ⏐ ${secondarySvc.name}` : activeSvc.name}
        proxyStatus={proxyState.status}
        serverName={proxyState.server?.name}
        onReload={reloadActive}
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
          onOpenNotes={() => setNotesOpen(true)}
          onOpenAI={() => setAiChatOpen(true)}
          onOpenApps={() => setAppsOpen(true)}
          onOpenCoBrowse={() => setCoBrowseOpen(true)}
          proxyStatus={proxyState.status}
        />
        <main className={`app__content ${secondarySvc ? 'app__content--split' : ''} ${resizing ? 'app__content--resizing' : ''}`} ref={dragRef}>
          {resizing && <div className="resize-overlay" />}
          <div
            className="pane pane--primary"
            style={secondarySvc ? { flex: `0 0 calc(${splitRatio * 100}% - 4px)` } : undefined}
          >
            {allServices.map((svc) => {
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
        proxyState={proxyState}
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
    </div>
  );
}
