import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Aggregates `chinazes-media-state` events from all webviews and renders a
// compact transport. Active-source selection is **sticky** — once a source is
// chosen it does not change just because another tab also reports media; we
// only switch when:
//   • the current source has been silent (no updates) for >12s, or
//   • the current source is paused AND another source is actively playing, or
//   • the user explicitly picks another from the popup list.
//
// Click on the bar opens a list of all live sources so the user can swap.

export default function MusicBar() {
  // serviceId -> { state, webview, updatedAt, lastPlayingAt }
  const sourcesRef = useRef(new Map());
  const [tick, setTick] = useState(0); // bump to re-render on state map changes
  const [activeId, setActiveId] = useState(null);
  const [seekDraft, setSeekDraft] = useState(null);
  const [vol, setVol] = useState(1);
  const [showList, setShowList] = useState(false);
  const userPickedRef = useRef(false); // sticks the user's choice

  // Map -> array helper
  const sources = useMemo(() => {
    return [...sourcesRef.current.entries()].map(([id, v]) => ({ id, ...v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const active = sources.find((s) => s.id === activeId) || null;

  useEffect(() => {
    function reconcile() {
      const all = [...sourcesRef.current.entries()].filter(([, v]) => v.state && v.state.duration > 0);
      if (!all.length) {
        setActiveId(null);
        userPickedRef.current = false;
        return;
      }
      const cur = activeId ? sourcesRef.current.get(activeId) : null;
      const curPlaying = cur && cur.state && !cur.state.paused;

      // Respect explicit user pick as long as it's still alive (has state).
      if (userPickedRef.current && cur && cur.state) return;

      // Keep current if it's playing.
      if (curPlaying) return;

      // Look for a playing source.
      const playing = all.find(([, v]) => v.state && !v.state.paused);
      if (playing) {
        setActiveId(playing[0]);
        return;
      }
      // No one playing: keep current paused source if any, otherwise pick most-recent.
      if (cur && cur.state) return;
      all.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
      setActiveId(all[0][0]);
    }

    function onMediaState(ev) {
      const { serviceId, state, sender } = ev.detail || {};
      if (!serviceId) return;
      if (!state) {
        sourcesRef.current.delete(serviceId);
      } else {
        const prev = sourcesRef.current.get(serviceId);
        sourcesRef.current.set(serviceId, {
          state,
          webview: sender || prev?.webview,
          updatedAt: Date.now(),
          lastPlayingAt: !state.paused ? Date.now() : (prev?.lastPlayingAt || 0),
        });
      }
      setTick((x) => x + 1);
      reconcile();
    }

    window.addEventListener('chinazes-media-state', onMediaState);
    // Periodic GC: drop stale (>12s no updates) and forget stale user-pick.
    const gc = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, v] of sourcesRef.current) {
        if (now - v.updatedAt > 12_000) {
          sourcesRef.current.delete(id);
          changed = true;
          if (id === activeId) userPickedRef.current = false;
        }
      }
      if (changed) {
        setTick((x) => x + 1);
        reconcile();
      }
    }, 5_000);
    return () => {
      window.removeEventListener('chinazes-media-state', onMediaState);
      clearInterval(gc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Sync volume slider when active state changes (but not while user is sliding).
  useEffect(() => {
    if (active?.state && seekDraft == null) {
      setVol(active.state.volume);
    }
  }, [active?.id, active?.state?.volume, seekDraft]);

  // Close popup on outside click.
  useEffect(() => {
    if (!showList) return;
    const onDoc = (e) => {
      if (!e.target.closest('.music-bar-popup') && !e.target.closest('.music-bar')) {
        setShowList(false);
      }
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [showList]);

  function send(action, extra) {
    if (!active?.webview) return;
    try { active.webview.send('chinazes:media-cmd', { action, ...extra }); } catch {}
  }
  function sendTo(src, action, extra) {
    if (!src?.webview) return;
    try { src.webview.send('chinazes:media-cmd', { action, ...extra }); } catch {}
  }

  if (!active || !active.state) return null;
  const s = active.state;
  const t = seekDraft != null ? seekDraft : s.currentTime;
  const dur = s.duration || 0;
  const otherSources = sources.filter((x) => x.id !== activeId && x.state);

  return (
    <div className="music-bar-wrap">
      <motion.div
        className="music-bar"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          className="music-bar__art-btn"
          onClick={() => setShowList((v) => !v)}
          title={otherSources.length ? `+${otherSources.length} ещё источников` : 'Источник'}
        >
          <div className="music-bar__art">
            {s.artwork
              ? <img src={s.artwork} alt="" draggable={false} />
              : <div className="music-bar__art-fallback">♪</div>}
          </div>
          {otherSources.length > 0 && (
            <span className="music-bar__more-badge">+{otherSources.length}</span>
          )}
        </button>
        <button
          className="music-bar__meta"
          onClick={() => setShowList((v) => !v)}
          title="Переключить источник"
        >
          <div className="music-bar__title" title={s.title}>{s.title || 'Без названия'}</div>
          {s.artist && <div className="music-bar__artist" title={s.artist}>{s.artist}</div>}
        </button>
        <button className="music-bar__btn" onClick={() => send('prev')} title="Предыдущий">⏮</button>
        <button
          className="music-bar__btn music-bar__btn--play"
          onClick={() => send(s.paused ? 'play' : 'pause')}
          title={s.paused ? 'Воспроизвести' : 'Пауза'}
        >{s.paused ? '▶' : '⏸'}</button>
        <button className="music-bar__btn" onClick={() => send('next')} title="Следующий">⏭</button>
        {dur > 0 && (
          <div className="music-bar__seek">
            <span className="music-bar__time">{fmt(t)}</span>
            <input
              type="range" min={0} max={Math.max(1, dur)} step={1}
              value={Math.min(t, dur)}
              onChange={(e) => setSeekDraft(parseFloat(e.target.value))}
              onMouseUp={(e) => { send('seek', { time: parseFloat(e.target.value) }); setSeekDraft(null); }}
              onTouchEnd={(e) => { send('seek', { time: parseFloat(e.target.value) }); setSeekDraft(null); }}
            />
            <span className="music-bar__time">{fmt(dur)}</span>
          </div>
        )}
        <div className="music-bar__vol">
          <span style={{ opacity: 0.6 }}>🔊</span>
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVol(v);
              send('volume', { value: v });
            }}
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {showList && (
          <motion.div
            className="music-bar-popup"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <div className="music-bar-popup__title">Все источники</div>
            {sources.map((src) => {
              const st = src.state;
              if (!st) return null;
              const isActive = src.id === activeId;
              return (
                <div
                  key={src.id}
                  className={`mbp-row ${isActive ? 'mbp-row--active' : ''}`}
                >
                  <div className="mbp-row__art">
                    {st.artwork
                      ? <img src={st.artwork} alt="" />
                      : <div className="music-bar__art-fallback">♪</div>}
                  </div>
                  <div className="mbp-row__meta">
                    <div className="mbp-row__title" title={st.title}>{st.title || src.id}</div>
                    <div className="mbp-row__sub">
                      <span className={`mbp-row__dot ${st.paused ? 'mbp-row__dot--paused' : 'mbp-row__dot--playing'}`} />
                      {st.paused ? 'Пауза' : 'Играет'} · {src.id}
                    </div>
                  </div>
                  <button
                    className="music-bar__btn"
                    onClick={() => sendTo(src, st.paused ? 'play' : 'pause')}
                    title={st.paused ? 'Play' : 'Pause'}
                  >{st.paused ? '▶' : '⏸'}</button>
                  {!isActive && (
                    <button
                      className="btn btn--ghost btn--small"
                      onClick={() => {
                        setActiveId(src.id);
                        userPickedRef.current = true;
                        setShowList(false);
                      }}
                      title="Сделать активным"
                    >→</button>
                  )}
                </div>
              );
            })}
            {userPickedRef.current && (
              <button
                className="btn btn--ghost btn--small mbp-auto"
                onClick={() => { userPickedRef.current = false; setShowList(false); }}
              >Авто-выбор</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
