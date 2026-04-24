import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function UpdateToast() {
  const [stage, setStage] = useState('idle'); // 'available' | 'progress' | 'ready' | 'error' | 'idle'
  const [info, setInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.chinazes?.updater) return;
    const off = window.chinazes.updater.on((event, payload) => {
      if (event === 'available')   { setInfo(payload); setStage('available'); setDismissed(false); }
      if (event === 'progress')    { setProgress(payload?.percent || 0); setStage('progress'); }
      if (event === 'downloaded')  { setInfo(payload); setStage('ready'); setDismissed(false); }
      if (event === 'error')       { setErrorMsg(String(payload || '')); setStage('error'); }
    });
    return () => off?.();
  }, []);

  const visible = !dismissed && stage !== 'idle';
  const version = info?.version ? `v${info.version}` : '';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`update-toast update-toast--${stage}`}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 12, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        >
          <button
            className="update-toast__close"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >×</button>
          {stage === 'available' && (
            <>
              <strong>Доступно обновление {version}</strong>
              <span>Скачивается в фоне…</span>
            </>
          )}
          {stage === 'progress' && (
            <>
              <strong>Загрузка обновления {version}</strong>
              <div className="update-toast__bar">
                <div className="update-toast__bar-fill" style={{ width: `${Math.max(2, progress).toFixed(0)}%` }} />
              </div>
              <span>{progress.toFixed(0)}%</span>
            </>
          )}
          {stage === 'ready' && (
            <>
              <strong>Обновление {version} готово</strong>
              <button
                className="btn btn--primary update-toast__btn"
                onClick={() => window.chinazes.updater.install()}
              >
                Перезапустить и установить
              </button>
            </>
          )}
          {stage === 'error' && (
            <>
              <strong>Ошибка обновления</strong>
              <span className="update-toast__err">{errorMsg.slice(0, 200)}</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
