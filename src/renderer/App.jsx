import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TitleBar from './components/TitleBar.jsx';
import ServiceView from './components/ServiceView.jsx';
import TabbedServiceView from './components/TabbedServiceView.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import NotesPanel from './components/NotesPanel.jsx';
import UpdateToast from './components/UpdateToast.jsx';
import { SERVICES } from './services.js';
import { applyTheme, getStoredTheme } from './themes.js';
import { UA_PRESETS, getStoredUA } from './user-agents.js';

const ORDER_KEY = 'chinazes:sidebar-order';

function loadOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    if (!Array.isArray(saved)) throw new Error();
    // Keep only ids that still exist + append any new services at the end.
    const known = new Set(SERVICES.map((s) => s.id));
    const filtered = saved.filter((id) => known.has(id));
    for (const s of SERVICES) if (!filtered.includes(s.id)) filtered.push(s.id);
    return filtered;
  } catch {
    return SERVICES.map((s) => s.id);
  }
}

export default function App() {
  const [order, setOrder] = useState(loadOrder);
  const [active, setActive] = useState(() => loadOrder()[0]);
  const [secondary, setSecondary] = useState(null); // service id for split-screen right pane
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
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

  const orderedServices = useMemo(
    () => order.map((id) => SERVICES.find((s) => s.id === id)).filter(Boolean),
    [order]
  );
  const activeSvc = useMemo(
    () => SERVICES.find((s) => s.id === active) || orderedServices[0],
    [active, orderedServices]
  );
  const secondarySvc = useMemo(
    () => (secondary ? SERVICES.find((s) => s.id === secondary) : null),
    [secondary]
  );

  const reloadActive = useCallback(() => {
    const wv = webviewRefs.current[active];
    if (!wv) return;
    try { wv.reload(); } catch {}
  }, [active]);

  const onSelectService = useCallback((id, opts = {}) => {
    if (opts.split) {
      // Toggle as secondary; if same as active, ignore; if same as current secondary, close.
      if (id === active) return;
      setSecondary((cur) => (cur === id ? null : id));
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

  // Drag-to-resize divider
  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    const container = dragRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev) => {
      const x = ev.clientX - rect.left;
      const ratio = Math.min(0.85, Math.max(0.15, x / rect.width));
      setSplitRatio(ratio);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

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
          proxyStatus={proxyState.status}
        />
        <main className={`app__content ${secondarySvc ? 'app__content--split' : ''}`} ref={dragRef}>
          <div
            className="pane pane--primary"
            style={secondarySvc ? { flex: `0 0 calc(${splitRatio * 100}% - 4px)` } : undefined}
          >
            {SERVICES.map((svc) => {
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
                  {SERVICES.map((svc) => {
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
      />
      <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} />
      <UpdateToast />
    </div>
  );
}
