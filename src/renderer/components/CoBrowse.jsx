import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CoBrowseHost, CoBrowseGuest, ALL_PERMS } from '../cobrowse-engine.js';

const DEFAULT_PERMS = {
  mouseControl: false,
  scroll:       true,
  keyboard:     false,
  mediaControl: true,
  volume:       false,
  copy:         true,
  download:     false,
};

export default function CoBrowse({ open, onClose, getActiveWebview }) {
  const [tab, setTab] = useState('host'); // 'host' | 'guest'
  // Host state
  const [permissions, setPermissions] = useState(DEFAULT_PERMS);
  const [hostSession, setHostSession] = useState(null); // { sessionId }
  const [hostGuests, setHostGuests] = useState([]);
  const [hostStatus, setHostStatus] = useState('');
  const [hostError, setHostError] = useState('');
  const hostRef = useRef(null);

  // Guest state
  const [joinId, setJoinId] = useState('');
  const [guestPerms, setGuestPerms] = useState({});
  const [guestStatus, setGuestStatus] = useState('');
  const [guestError, setGuestError] = useState('');
  const [guestActive, setGuestActive] = useState(false);
  const [guestSize, setGuestSize] = useState({ w: 0, h: 0 });
  const guestRef = useRef(null);
  const guestImgRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    return () => stopAll();
  }, [open]);

  function stopAll() {
    if (hostRef.current) { hostRef.current.stop(); hostRef.current = null; }
    if (guestRef.current) { guestRef.current.disconnect(); guestRef.current = null; }
    setHostSession(null);
    setHostGuests([]);
    setGuestActive(false);
  }

  // ---------- Host ----------
  async function startHost() {
    setHostError('');
    const wv = getActiveWebview?.();
    if (!wv) {
      setHostError('Открой какой-нибудь сервис перед стартом сессии.');
      return;
    }
    const host = new CoBrowseHost({
      permissions,
      fps: 5,
      onGuestChange: setHostGuests,
      onStatus: setHostStatus,
      onError: (e) => setHostError(String(e?.message || e)),
    });
    host.setActiveWebview(wv);
    try {
      await host.start();
      hostRef.current = host;
      setHostSession({ sessionId: host.sessionId });
    } catch (e) {
      setHostError(String(e?.message || e));
    }
  }

  function stopHost() {
    if (hostRef.current) { hostRef.current.stop(); hostRef.current = null; }
    setHostSession(null);
    setHostGuests([]);
    setHostStatus('');
  }

  function togglePerm(key) {
    const next = { ...permissions, [key]: !permissions[key] };
    setPermissions(next);
    if (hostRef.current) hostRef.current.setPermissions(next);
  }

  function copySessionLink() {
    if (!hostSession) return;
    const link = hostSession.sessionId;
    navigator.clipboard.writeText(link).catch(() => {});
  }

  // ---------- Guest ----------
  async function startGuest() {
    setGuestError('');
    if (!joinId.trim()) return;
    const guest = new CoBrowseGuest({
      sessionId: joinId.trim(),
      onFrame: (frame) => {
        if (guestImgRef.current) guestImgRef.current.src = frame.dataUrl;
        setGuestSize({ w: frame.w, h: frame.h });
      },
      onPermissions: setGuestPerms,
      onStatus: setGuestStatus,
      onError: (e) => setGuestError(String(e?.message || e)),
      onClose: () => setGuestActive(false),
    });
    try {
      await guest.connect();
      guestRef.current = guest;
      setGuestActive(true);
    } catch (e) {
      setGuestError(String(e?.message || e));
    }
  }

  function stopGuest() {
    if (guestRef.current) { guestRef.current.disconnect(); guestRef.current = null; }
    setGuestActive(false);
    setGuestStatus('');
  }

  function onGuestFrameClick(e) {
    if (!guestPerms.mouseControl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top)  / rect.height;
    guestRef.current?.send({ type: 'mouse', action: 'click', xRatio, yRatio, button: e.button === 2 ? 'right' : 'left' });
  }
  function onGuestFrameWheel(e) {
    if (!guestPerms.scroll) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top)  / rect.height;
    guestRef.current?.send({ type: 'wheel', dx: e.deltaX, dy: e.deltaY, xRatio, yRatio });
  }
  function onGuestKey(e) {
    if (!guestPerms.keyboard) return;
    e.preventDefault();
    if (e.key.length === 1) {
      guestRef.current?.send({ type: 'key', text: e.key });
    } else {
      guestRef.current?.send({ type: 'key', keyCode: e.key, action: 'down' });
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cobrowse-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="cobrowse"
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
          >
            <header className="cobrowse__head">
              <h3>Co-browsing</h3>
              <div className="cobrowse__tabs">
                <button
                  className={`cobrowse__tab ${tab === 'host' ? 'cobrowse__tab--active' : ''}`}
                  onClick={() => setTab('host')}
                >Хост</button>
                <button
                  className={`cobrowse__tab ${tab === 'guest' ? 'cobrowse__tab--active' : ''}`}
                  onClick={() => setTab('guest')}
                >Гость</button>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </header>

            {tab === 'host' && (
              <div className="cobrowse__body">
                {!hostSession && (
                  <>
                    <p className="modal__hint">
                      Создай сессию: видео твоей вкладки будет транслироваться гостям через WebRTC. Ты можешь дать им разрешение кликать, скроллить, управлять медиа и т.д.
                    </p>
                    <div className="cobrowse__perms">
                      <h4>Разрешения для гостей</h4>
                      {Object.entries(ALL_PERMS).map(([k, label]) => (
                        <label key={k} className="cobrowse__perm">
                          <input type="checkbox" checked={!!permissions[k]} onChange={() => togglePerm(k)} />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <button className="btn btn--primary cobrowse__main-btn" onClick={startHost}>
                      Создать сессию
                    </button>
                    {hostError && <p className="cobrowse__err">⚠ {hostError}</p>}
                  </>
                )}
                {hostSession && (
                  <>
                    <div className="cobrowse__session-id">
                      <label>ID сессии:</label>
                      <code>{hostSession.sessionId}</code>
                      <button className="btn btn--ghost btn--small" onClick={copySessionLink}>Копировать</button>
                    </div>
                    <p className="modal__hint">{hostStatus}</p>
                    <div className="cobrowse__guests">
                      <h4>Подключённые ({hostGuests.length})</h4>
                      {hostGuests.length === 0 && <p className="modal__hint">Гостей пока нет.</p>}
                      {hostGuests.map((id) => (
                        <div key={id} className="cobrowse__guest">{id}</div>
                      ))}
                    </div>
                    <div className="cobrowse__perms">
                      <h4>Разрешения (можно менять на лету)</h4>
                      {Object.entries(ALL_PERMS).map(([k, label]) => (
                        <label key={k} className="cobrowse__perm">
                          <input type="checkbox" checked={!!permissions[k]} onChange={() => togglePerm(k)} />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <button className="btn btn--ghost cobrowse__main-btn" onClick={stopHost}>
                      Завершить сессию
                    </button>
                  </>
                )}
              </div>
            )}

            {tab === 'guest' && (
              <div className="cobrowse__body">
                {!guestActive && (
                  <>
                    <p className="modal__hint">
                      Вставь ID сессии, который дал тебе хост. Получишь видео его вкладки и сможешь взаимодействовать в рамках выданных разрешений.
                    </p>
                    <div className="plugin-form__row">
                      <input
                        className="input"
                        placeholder="chinazes-xxxxxxxx"
                        value={joinId}
                        onChange={(e) => setJoinId(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') startGuest(); }}
                      />
                      <button className="btn btn--primary" onClick={startGuest} disabled={!joinId.trim()}>
                        Подключиться
                      </button>
                    </div>
                    {guestError && <p className="cobrowse__err">⚠ {guestError}</p>}
                  </>
                )}
                {guestActive && (
                  <>
                    <div className="cobrowse__guest-toolbar">
                      <span className="cobrowse__status-pill">{guestStatus}</span>
                      <span className="cobrowse__perms-badges">
                        {Object.entries(guestPerms).filter(([, v]) => v).map(([k]) => (
                          <span key={k} className="cobrowse__perm-badge">{ALL_PERMS[k] || k}</span>
                        ))}
                      </span>
                      <button className="btn btn--ghost btn--small" onClick={stopGuest}>Отключиться</button>
                    </div>
                    <div
                      className="cobrowse__viewer"
                      tabIndex={0}
                      onClick={onGuestFrameClick}
                      onContextMenu={(e) => { e.preventDefault(); onGuestFrameClick(e); }}
                      onWheel={onGuestFrameWheel}
                      onKeyDown={onGuestKey}
                      style={{ cursor: guestPerms.mouseControl ? 'pointer' : 'default' }}
                    >
                      <img ref={guestImgRef} alt="cobrowse-frame" />
                      {guestSize.w === 0 && <div className="cobrowse__waiting">Ожидание кадров...</div>}
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
