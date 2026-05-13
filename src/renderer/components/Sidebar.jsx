import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { BrandIcon, SettingsIcon, ShieldIcon, NotesIcon, AIIcon, AppsIcon, ShareIcon, ExternalWindowIcon } from './Icons.jsx';
import EqualizerCanvas from './EqualizerCanvas.jsx';

function SidebarAvatar({ playing, accent }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <motion.div
        className={`sidebar__logo-dot ${playing ? 'sidebar__logo-dot--playing' : ''}`}
        animate={playing ? {
          scale: [1, 1.18, 0.92, 1.08, 1],
          borderRadius: ['7px', '5px', '10px', '6px', '7px'],
          boxShadow: [
            `0 0 0 0 ${accent}00, 0 6px 24px -4px color-mix(in oklab, ${accent} 50%, transparent)`,
            `0 0 22px 6px ${accent}50, 0 6px 24px -4px color-mix(in oklab, ${accent} 50%, transparent)`,
            `0 0 8px 3px ${accent}30, 0 6px 24px -4px color-mix(in oklab, ${accent} 50%, transparent)`,
            `0 0 16px 5px ${accent}40, 0 6px 24px -4px color-mix(in oklab, ${accent} 50%, transparent)`,
            `0 0 0 0 ${accent}00, 0 6px 24px -4px color-mix(in oklab, ${accent} 50%, transparent)`,
          ],
        } : {
          rotate: 360,
          scale: 1,
          borderRadius: '7px',
          boxShadow: `0 0 0 0 ${accent}00, 0 6px 24px -4px color-mix(in oklab, ${accent} 50%, transparent)`,
        }}
        transition={playing ? {
          duration: 1.6,
          repeat: Infinity,
          ease: 'easeInOut',
        } : {
          duration: 14,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    );
  }
  return (
    <motion.img
      src="avatar.png"
      alt="logo"
      className={`sidebar__avatar ${playing ? 'sidebar__avatar--playing' : ''}`}
      onError={() => setOk(false)}
      whileHover={playing ? undefined : { scale: 1.05, rotate: 6 }}
      animate={playing ? {
        scale: [1, 1.08, 0.96, 1.04, 1],
        boxShadow: [
          `0 0 0 2px ${accent}60, 0 0 18px 4px ${accent}30, 0 8px 24px -8px color-mix(in oklab, ${accent} 60%, transparent)`,
          `0 0 0 2px ${accent}C0, 0 0 28px 8px ${accent}50, 0 8px 24px -8px color-mix(in oklab, ${accent} 60%, transparent)`,
          `0 0 0 2px ${accent}80, 0 0 10px 3px ${accent}20, 0 8px 24px -8px color-mix(in oklab, ${accent} 60%, transparent)`,
          `0 0 0 2px ${accent}A0, 0 0 20px 6px ${accent}40, 0 8px 24px -8px color-mix(in oklab, ${accent} 60%, transparent)`,
          `0 0 0 2px ${accent}60, 0 0 18px 4px ${accent}30, 0 8px 24px -8px color-mix(in oklab, ${accent} 60%, transparent)`,
        ],
      } : {
        scale: 1,
        boxShadow: `0 0 0 2px color-mix(in oklab, ${accent} 70%, transparent), 0 8px 24px -8px color-mix(in oklab, ${accent} 60%, transparent)`,
      }}
      transition={playing ? {
        duration: 1.8,
        repeat: Infinity,
        ease: 'easeInOut',
      } : {
        type: 'spring', stiffness: 300, damping: 18,
      }}
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
  onOpenYouTubeMiniPlayer,
}) {
  const [dragging, setDragging] = useState(false);
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [mediaAccent, setMediaAccent] = useState(services.find((s) => s.id === active)?.accent || '#888');

  useEffect(() => {
    function onMedia(ev) {
      const { serviceId, state } = ev.detail || {};
      if (!serviceId || !state) { setMediaPlaying(false); return; }
      const playing = !state.paused && state.duration > 0;
      setMediaPlaying(playing);
      if (playing) {
        const svc = services.find((s) => s.id === serviceId);
        if (svc?.accent) setMediaAccent(svc.accent);
      }
    }
    window.addEventListener('chinazes-media-state', onMedia);
    return () => window.removeEventListener('chinazes-media-state', onMedia);
  }, [services]);

  return (
    <aside className="sidebar">
      <EqualizerCanvas playing={mediaPlaying} vertical />
      <div className="sidebar__logo">
        <SidebarAvatar playing={mediaPlaying} accent={mediaAccent} />
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
        {onOpenYouTubeMiniPlayer && (
          <button
            className="tab tab--bottom youtube-window-btn"
            onClick={onOpenYouTubeMiniPlayer}
            aria-label="YouTube mini player"
            title="Открыть YouTube mini player (поверх других окон)"
            style={{ color: '#FF0033' }}
          >
            <ExternalWindowIcon />
          </button>
        )}
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
