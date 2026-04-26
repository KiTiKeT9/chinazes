import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STORE_KEY = 'chinazes:notif-history';
const MAX_KEEP = 50;

function loadHistory() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveHistory(arr) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(arr.slice(0, MAX_KEEP))); } catch {}
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч`;
  return `${Math.floor(h / 24)}д`;
}

export default function NotificationsBell() {
  const [items, setItems] = useState(loadHistory);
  const [unread, setUnread] = useState(() => {
    const stored = parseInt(localStorage.getItem('chinazes:notif-unread') || '0', 10);
    return Number.isFinite(stored) ? stored : 0;
  });
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => { saveHistory(items); }, [items]);
  useEffect(() => { localStorage.setItem('chinazes:notif-unread', String(unread)); }, [unread]);

  useEffect(() => {
    function onNotif(ev) {
      const d = ev.detail || {};
      const p = d.payload || {};
      if (!p.title && !p.body) return;
      setItems((cur) => {
        const next = [{
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          serviceId: d.serviceId,
          serviceName: d.serviceName,
          title: p.title || '',
          body: p.body || '',
          icon: p.icon || '',
          tag: p.tag || '',
          ts: p.ts || Date.now(),
          url: p.url || '',
        }, ...cur];
        return next.slice(0, MAX_KEEP);
      });
      setUnread((n) => n + 1);
    }
    window.addEventListener('chinazes-notification', onNotif);
    return () => window.removeEventListener('chinazes-notification', onNotif);
  }, []);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  function clearAll() {
    setItems([]);
    setUnread(0);
  }

  return (
    <div className="notif-bell" ref={wrapRef}>
      <button
        className="notif-bell__btn"
        onClick={() => setOpen((v) => !v)}
        title={unread > 0 ? `${unread} новых уведомлений` : 'Уведомления'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-bell__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-popup"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <div className="notif-popup__head">
              <span className="notif-popup__title">Уведомления</span>
              {items.length > 0 && (
                <button className="btn btn--ghost btn--small" onClick={clearAll}>Очистить</button>
              )}
            </div>
            <div className="notif-popup__list">
              {items.length === 0 && (
                <div className="notif-empty">Пока нет уведомлений с сайтов.</div>
              )}
              {items.map((n) => (
                <div key={n.id} className="notif-row">
                  {n.icon && <img className="notif-row__icon" src={n.icon} alt="" />}
                  <div className="notif-row__content">
                    <div className="notif-row__title">{n.title || '(без заголовка)'}</div>
                    {n.body && <div className="notif-row__body">{n.body}</div>}
                    <div className="notif-row__meta">
                      {n.serviceName || n.serviceId} · {timeAgo(n.ts)} назад
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
