import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Aggregates `chinazes-media-state` events from all webviews and renders a
// compact transport (artwork + title + transport + seek + volume).
//
// Active source heuristic: prefer a state that is currently playing; if
// multiple, prefer the most-recently-updated. Stale entries (>10s no update)
// drop off.
export default function MusicBar() {
  // serviceId -> { state, webview, updatedAt }
  const sourcesRef = useRef(new Map());
  const [active, setActive] = useState(null); // { serviceId, state, webview }
  const [seekDraft, setSeekDraft] = useState(null);
  const [vol, setVol] = useState(1);

  useEffect(() => {
    function pickActive() {
      const arr = [...sourcesRef.current.entries()]
        .filter(([, v]) => v.state && v.state.duration > 0)
        .map(([id, v]) => ({ id, ...v }));
      if (!arr.length) return null;
      // Prefer playing.
      const playing = arr.filter((x) => !x.state.paused);
      const pool = playing.length ? playing : arr;
      pool.sort((a, b) => b.updatedAt - a.updatedAt);
      return pool[0];
    }

    function onMediaState(ev) {
      const { serviceId, state, sender } = ev.detail || {};
      if (!serviceId) return;
      if (!state) {
        sourcesRef.current.delete(serviceId);
      } else {
        sourcesRef.current.set(serviceId, {
          state,
          webview: sender,
          updatedAt: Date.now(),
        });
      }
      const next = pickActive();
      if (next) {
        setActive({ serviceId: next.id, state: next.state, webview: next.webview });
        if (seekDraft == null) setVol(next.state.volume);
      } else {
        setActive(null);
      }
    }

    window.addEventListener('chinazes-media-state', onMediaState);
    // Drop stale every 5s.
    const t = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, v] of sourcesRef.current) {
        if (now - v.updatedAt > 12_000) { sourcesRef.current.delete(id); changed = true; }
      }
      if (changed) {
        const next = pickActive();
        setActive(next ? { serviceId: next.id, state: next.state, webview: next.webview } : null);
      }
    }, 5_000);
    return () => {
      window.removeEventListener('chinazes-media-state', onMediaState);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send(action, extra) {
    if (!active?.webview) return;
    try { active.webview.send('chinazes:media-cmd', { action, ...extra }); } catch {}
  }

  if (!active || !active.state) return null;
  const s = active.state;
  const t = seekDraft != null ? seekDraft : s.currentTime;
  const dur = s.duration || 0;

  return (
    <AnimatePresence>
      <motion.div
        className="music-bar"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
      >
        <div className="music-bar__art">
          {s.artwork
            ? <img src={s.artwork} alt="" draggable={false} />
            : <div className="music-bar__art-fallback">♪</div>}
        </div>
        <div className="music-bar__meta">
          <div className="music-bar__title" title={s.title}>{s.title || 'Без названия'}</div>
          {s.artist && <div className="music-bar__artist" title={s.artist}>{s.artist}</div>}
        </div>
        <button
          className="music-bar__btn"
          onClick={() => send('prev')}
          title="Предыдущий"
        >⏮</button>
        <button
          className="music-bar__btn music-bar__btn--play"
          onClick={() => send(s.paused ? 'play' : 'pause')}
          title={s.paused ? 'Воспроизвести' : 'Пауза'}
        >{s.paused ? '▶' : '⏸'}</button>
        <button
          className="music-bar__btn"
          onClick={() => send('next')}
          title="Следующий"
        >⏭</button>
        {dur > 0 && (
          <div className="music-bar__seek">
            <span className="music-bar__time">{fmt(t)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, dur)}
              step={1}
              value={Math.min(t, dur)}
              onChange={(e) => setSeekDraft(parseFloat(e.target.value))}
              onMouseUp={(e) => {
                const v = parseFloat(e.target.value);
                send('seek', { time: v });
                setSeekDraft(null);
              }}
              onTouchEnd={(e) => {
                const v = parseFloat(e.target.value);
                send('seek', { time: v });
                setSeekDraft(null);
              }}
            />
            <span className="music-bar__time">{fmt(dur)}</span>
          </div>
        )}
        <div className="music-bar__vol">
          <span style={{ opacity: 0.6 }}>🔊</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={vol}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVol(v);
              send('volume', { value: v });
            }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function fmt(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}
