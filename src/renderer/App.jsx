import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TitleBar from './components/TitleBar.jsx';
import ServiceView from './components/ServiceView.jsx';
import TabbedServiceView from './components/TabbedServiceView.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import UpdateToast from './components/UpdateToast.jsx';
import { SERVICES } from './services.js';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [proxyState, setProxyState] = useState({
    status: 'disconnected',
    message: '',
    server: null,
    socksPort: 10808,
  });

  // Refs to webviews keyed by service id so TitleBar reload can trigger them.
  const webviewRefs = useRef({});

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

  const reloadActive = useCallback(() => {
    const wv = webviewRefs.current[active];
    if (!wv) return;
    try { wv.reload(); } catch {}
  }, [active]);

  return (
    <div
      className="app"
      style={{ '--accent': activeSvc.accent, '--accent-gradient': activeSvc.gradient }}
    >
      <div className="app__glow" />
      <TitleBar
        title={activeSvc.name}
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
          onSelect={setActive}
          onOpenSettings={() => setSettingsOpen(true)}
          proxyStatus={proxyState.status}
        />
        <main className="app__content">
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
        </main>
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        proxyState={proxyState}
      />
      <UpdateToast />
    </div>
  );
}
