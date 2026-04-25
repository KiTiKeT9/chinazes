import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ReloadIcon } from './Icons.jsx';

export default function TitleBar({ title, proxyStatus, serverName, onReload }) {
  const api = window.chinazes?.window;
  const [version, setVersion] = useState('');
  useEffect(() => {
    window.chinazes?.app?.getVersion?.().then(setVersion).catch(() => {});
  }, []);

  const statusLabel = {
    connected: 'Proxy online',
    starting: 'Connecting…',
    disconnected: 'Direct',
    error: 'Proxy error',
  }[proxyStatus] || 'Direct';

  return (
    <div className="titlebar">
      <div className="titlebar__drag">
        <span className="titlebar__title">
          {title}
          {version && <span className="titlebar__version">v{version}</span>}
        </span>
        <span className={`titlebar__status titlebar__status--${proxyStatus}`}>
          <span className="dot" />
          {statusLabel}
          {serverName ? <em> · {serverName}</em> : null}
        </span>
      </div>
      <div className="titlebar__actions">
        {onReload && (
          <motion.button
            className="wbtn wbtn--reload"
            onClick={onReload}
            whileTap={{ rotate: 360 }}
            transition={{ duration: 0.5 }}
            aria-label="Reload page"
            title="Reload current page"
          >
            <ReloadIcon />
          </motion.button>
        )}
      </div>
      <div className="titlebar__controls">
        <button className="wbtn" onClick={() => api?.minimize()} aria-label="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" /></svg>
        </button>
        <button className="wbtn" onClick={() => api?.toggleMaximize()} aria-label="Maximize">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        </button>
        <button className="wbtn wbtn--close" onClick={() => api?.close()} aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.4" /></svg>
        </button>
      </div>
    </div>
  );
}
