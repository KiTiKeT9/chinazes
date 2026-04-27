import React, { useRef, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { BrandIcon, SettingsIcon, ShieldIcon, NotesIcon, AIIcon, AppsIcon, ShareIcon } from './Icons.jsx';

function SidebarAvatar() {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <motion.div
        className="sidebar__logo-dot"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
    );
  }
  return (
    <motion.img
      src="avatar.png"
      alt="logo"
      className="sidebar__avatar"
      onError={() => setOk(false)}
      whileHover={{ scale: 1.05, rotate: 6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      draggable={false}
    />
  );
}

function ServiceTab({ svc, isActive, isSecondary, onSelect, dragging, setDragging, index }) {
  const downAt = useRef(0);
  const moved = useRef(false);

  return (
    <Reorder.Item
      value={svc.id}
      as="div"
      whileDrag={{ scale: 1.08, zIndex: 5 }}
      onDragStart={() => { setDragging(true); moved.current = true; }}
      onDragEnd={() => { setTimeout(() => setDragging(false), 50); }}
      className="tab-wrap"
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
    >
      <button
        className={`tab ${isActive ? 'tab--active' : ''} ${isSecondary ? 'tab--secondary' : ''} ${dragging ? 'tab--dragging' : ''}`}
        onPointerDown={() => { downAt.current = Date.now(); moved.current = false; }}
        onClick={(e) => {
          if (moved.current && Date.now() - downAt.current > 120) return;
          onSelect(svc.id, { split: e.shiftKey || e.altKey });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(svc.id, { split: true });
        }}
        style={{ '--accent': svc.accent }}
        aria-label={svc.name}
        title={`${svc.name}${index < 10 ? ` (Ctrl+${index === 9 ? 0 : index + 1})` : ''} — Shift+click для split-screen`}
      >
        <AnimatePresence>
          {isActive && (
            <motion.span
              layoutId="tab-indicator"
              className="tab__indicator"
              style={{ background: svc.gradient }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
        </AnimatePresence>

        <motion.span
          className="tab__icon"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          animate={{
            color: isActive ? svc.accent : 'rgba(230, 232, 255, 0.55)',
          }}
          transition={{ duration: 0.25 }}
        >
          {svc.iconUrl
            ? <img src={svc.iconUrl} alt="" className="tab__favicon" draggable={false} />
            : <BrandIcon id={svc.icon} />}
        </motion.span>

        <span className="tab__tooltip">{svc.name}</span>
      </button>
    </Reorder.Item>
  );
}

export default function Sidebar({
  services,
  order,
  onReorder,
  active,
  secondary,
  onSelect,
  onOpenSettings,
  onOpenNotes,
  onOpenAI,
  onOpenApps,
  onOpenCoBrowse,
  proxyStatus,
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <SidebarAvatar />
      </div>

      <Reorder.Group
        axis="y"
        values={order}
        onReorder={onReorder}
        className="sidebar__nav"
        as="nav"
      >
        {services.map((svc, idx) => (
          <ServiceTab
            key={svc.id}
            svc={svc}
            index={idx}
            isActive={active === svc.id}
            isSecondary={secondary === svc.id}
            onSelect={onSelect}
            dragging={dragging}
            setDragging={setDragging}
          />
        ))}
      </Reorder.Group>

      <div className="sidebar__bottom">
        {onOpenCoBrowse && (
          <button
            className="tab tab--bottom"
            onClick={onOpenCoBrowse}
            aria-label="Co-browse"
            title="Co-browsing (двойная сессия)"
          >
            <ShareIcon />
          </button>
        )}
        {onOpenApps && (
          <button
            className="tab tab--bottom"
            onClick={onOpenApps}
            aria-label="Apps"
            title="Приложения и игры"
          >
            <AppsIcon />
          </button>
        )}
        {onOpenAI && (
          <button
            className="tab tab--bottom"
            onClick={onOpenAI}
            aria-label="AI Chat"
            title="AI чат"
          >
            <AIIcon />
          </button>
        )}
        {onOpenNotes && (
          <button
            className="tab tab--bottom"
            onClick={onOpenNotes}
            aria-label="Notes"
            title="Заметки"
          >
            <NotesIcon />
          </button>
        )}
        <button
          className={`tab tab--bottom proxy-pill proxy-pill--${proxyStatus}`}
          title={`Proxy: ${proxyStatus}`}
          onClick={onOpenSettings}
        >
          <ShieldIcon />
        </button>
        <button
          className="tab tab--bottom"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </div>
    </aside>
  );
}
