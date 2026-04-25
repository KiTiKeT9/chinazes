import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const BUILTIN = { id: 'builtin', label: 'Built-in', subtitle: 'Универсальная встроенная стратегия' };

function categorize(name) {
  const n = name.toLowerCase();
  if (n.startsWith('ytdisbystro')) return 'YouTube + Discord';
  if (n.startsWith('general'))     return 'General';
  if (n.startsWith('discord'))     return 'Discord';
  if (n.startsWith('alt'))         return 'Alt presets';
  if (n.startsWith('faketls'))     return 'Fake TLS';
  if (n.startsWith('original_bolvan')) return 'Original (bol-van)';
  if (n.startsWith('bystro'))      return 'Bystro';
  if (n.startsWith('mgts') || n.startsWith('rosmts') || n.startsWith('rosmega') || n.startsWith('ufanet') || n.startsWith('shigulovski')) return 'ISP-specific';
  if (n.startsWith('split') || n.startsWith('multisplit')) return 'Split-based';
  if (n.startsWith('md5sig') || n.startsWith('ttlpadencap') || n.startsWith('datanoackpad')) return 'Low-level';
  if (n.startsWith('valorant') || n.startsWith('ankddev')) return 'Games';
  return 'Other';
}

function prettify(name) {
  return name
    .replace(/\.txt$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b(allsites|all sites)\b/i, '· all sites');
}

export default function StrategyPicker({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const items = useMemo(() => {
    const list = [BUILTIN, ...options.map((name) => ({
      id: name,
      label: prettify(name),
      subtitle: name,
      group: categorize(name),
    }))];
    const q = query.trim().toLowerCase();
    return q
      ? list.filter((i) => i.id.toLowerCase().includes(q) || (i.label || '').toLowerCase().includes(q))
      : list;
  }, [options, query]);

  const grouped = useMemo(() => {
    const out = new Map();
    for (const it of items) {
      const g = it.group || 'Special';
      if (!out.has(g)) out.set(g, []);
      out.get(g).push(it);
    }
    return [...out.entries()].sort(([a], [b]) => {
      if (a === 'Special') return -1;
      if (b === 'Special') return 1;
      return a.localeCompare(b);
    });
  }, [items]);

  const all = [BUILTIN, ...options.map((name) => ({ id: name, label: prettify(name), subtitle: name }))];
  const selected = all.find((i) => i.id === value) || BUILTIN;

  const panel = createPortal(
    <AnimatePresence>
      {open && rect && (
        <motion.div
          ref={panelRef}
          className="strat__panel"
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
          }}
        >
          <div className="strat__search">
            <span className="strat__search-icon">⌕</span>
            <input
              ref={inputRef}
              placeholder="Поиск стратегии…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="strat__clear" onClick={() => setQuery('')} aria-label="Clear">×</button>
            )}
          </div>
          <div className="strat__list">
            {grouped.length === 0 && <div className="strat__empty">Ничего не найдено</div>}
            {grouped.map(([group, list]) => (
              <div key={group} className="strat__group">
                <div className="strat__group-title">{group}</div>
                {list.map((it) => (
                  <button
                    key={it.id}
                    className={`strat__item ${it.id === value ? 'strat__item--active' : ''}`}
                    onClick={() => { onChange(it.id); setOpen(false); setQuery(''); }}
                  >
                    <span className="strat__badge">{it.id === 'builtin' ? '⚡' : '◆'}</span>
                    <div className="strat__item-text">
                      <span className="strat__title">{it.label}</span>
                      <span className="strat__subtitle">{it.subtitle}</span>
                    </div>
                    {it.id === value && <span className="strat__check">✓</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  return (
    <div className="strat">
      <button
        ref={triggerRef}
        type="button"
        className={`strat__trigger ${open ? 'strat__trigger--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="strat__trigger-main">
          <span className="strat__badge">{value === 'builtin' ? '⚡' : '◆'}</span>
          <div className="strat__trigger-text">
            <span className="strat__title">{selected.label}</span>
            <span className="strat__subtitle">{selected.subtitle}</span>
          </div>
        </div>
        <motion.span
          className="strat__chev"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >▾</motion.span>
      </button>
      {panel}
    </div>
  );
}
