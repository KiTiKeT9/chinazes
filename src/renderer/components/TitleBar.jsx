import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ReloadIcon } from './Icons.jsx';
import MusicBar from './MusicBar.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import EqualizerCanvas from './EqualizerCanvas.jsx';

function fmtBps(bps) {
  if (!bps || bps < 1) return '0 B/s';
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  if (bps < 1024 * 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(2)} MB/s`;
  return `${(bps / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
}

function AIIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export default function TitleBar({ title, proxyStatus, serverName, onReload, onOpenAI, activeServiceId, mediaPlaying }) {
  const api = window.chinazes?.window;
  const [version, setVersion] = useState('');
  const [stats, setStats] = useState({ rxBps: 0, txBps: 0 });
  useEffect(() => {
    window.chinazes?.app?.getVersion?.().then(setVersion).catch(() => {});
    const off = window.chinazes?.net?.onStats?.((s) => setStats(s));
    return () => off?.();
  }, []);

  const statusLabel = {
    connected: 'Proxy online',
    starting: 'Connecting…',
    disconnected: 'Direct',
    error: 'Proxy error',
  }[proxyStatus] || 'Direct';

  return (
    <div className="titlebar">
      <EqualizerCanvas playing={mediaPlaying} />
      <img className="titlebar__watermark" src="previev.png" alt="" draggable={false} />
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
      <NotificationsBell />
      <MusicBar activeServiceId={activeServiceId} />
      <div className="titlebar__netstats" title="Системный сетевой трафик">
        <span className="netstats__line">
          <span className="netstats__arrow netstats__arrow--down">↓</span>
          <span className="netstats__val">{fmtBps(stats.rxBps)}</span>
        </span>
        <span className="netstats__line">
          <span className="netstats__arrow netstats__arrow--up">↑</span>
          <span className="netstats__val">{fmtBps(stats.txBps)}</span>
        </span>
      </div>
      <div className="titlebar__actions">
        {onOpenAI && (
          <button className="wbtn" onClick={onOpenAI} aria-label="AI Chat" title="AI Assistant (✨)">
            <AIIcon />
          </button>
        )}
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
