import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Listens for `screen-share:request` from main and shows a modal grid of
// screens/windows to choose from. Reply via `screen-share:answer`.
export default function ScreenSharePicker() {
  const [request, setRequest] = useState(null); // { requestId, sources }
  const [tab, setTab] = useState('screen');     // 'screen' | 'window'

  useEffect(() => {
    if (!window.chinazes?.screenShare) return;
    const off = window.chinazes.screenShare.onRequest((payload) => {
      setRequest(payload);
      setTab('screen');
    });
    return () => off?.();
  }, []);

  function pick(sourceId) {
    if (!request) return;
    window.chinazes.screenShare.answer(request.requestId, sourceId);
    setRequest(null);
  }
  function cancel() { pick(null); }

  if (!request) return null;
  const screens = request.sources.filter((s) => s.isScreen);
  const windows = request.sources.filter((s) => !s.isScreen);
  const list = tab === 'screen' ? screens : windows;

  return (
    <AnimatePresence>
      <motion.div
        className="ss-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={cancel}
      >
        <motion.div
          className="ss-modal"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="ss-modal__header">
            <h2>Демонстрация экрана</h2>
            <button className="modal__close" onClick={cancel}>×</button>
          </header>
          <div className="modal__seg">
            <button
              className={`modal__seg-btn ${tab === 'screen' ? 'modal__seg-btn--active' : ''}`}
              onClick={() => setTab('screen')}
            >Экраны ({screens.length})</button>
            <button
              className={`modal__seg-btn ${tab === 'window' ? 'modal__seg-btn--active' : ''}`}
              onClick={() => setTab('window')}
            >Окна ({windows.length})</button>
          </div>
          <div className="ss-grid">
            {list.length === 0 && (
              <div className="ss-empty">Источников не найдено</div>
            )}
            {list.map((src) => (
              <button key={src.id} className="ss-item" onClick={() => pick(src.id)}>
                {src.thumbnail
                  ? <img className="ss-item__thumb" src={src.thumbnail} alt="" draggable={false} />
                  : <div className="ss-item__thumb ss-item__thumb--blank" />}
                <div className="ss-item__caption">
                  {src.appIcon && <img className="ss-item__icon" src={src.appIcon} alt="" draggable={false} />}
                  <span className="ss-item__name" title={src.name}>{src.name}</span>
                </div>
              </button>
            ))}
          </div>
          <footer className="ss-modal__footer">
            <button className="btn btn--ghost" onClick={cancel}>Отмена</button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
