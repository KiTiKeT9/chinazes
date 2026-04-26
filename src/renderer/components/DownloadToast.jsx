import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Listens to download progress from main and shows a small toast at the bottom.
export default function DownloadToast() {
  const [items, setItems] = useState([]); // { url, phase, percent?, message?, noteId? }

  useEffect(() => {
    if (!window.chinazes?.notes?.onDownloadProgress) return;
    const off = window.chinazes.notes.onDownloadProgress((p) => {
      setItems((cur) => {
        const idx = cur.findIndex((x) => x.url === p.url);
        const next = idx >= 0
          ? cur.map((x, i) => (i === idx ? { ...x, ...p } : x))
          : [...cur, p];
        return next;
      });
      if (p.phase === 'done' || p.phase === 'error') {
        setTimeout(() => {
          setItems((cur) => cur.filter((x) => x.url !== p.url));
        }, 4000);
      }
    });
    return () => off?.();
  }, []);

  return (
    <div className="dl-toasts">
      <AnimatePresence>
        {items.map((it) => (
          <motion.div
            key={it.url}
            className={`dl-toast dl-toast--${it.phase}`}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
          >
            <div className="dl-toast__title">
              {it.phase === 'fetch-binary' && 'Скачиваю yt-dlp...'}
              {it.phase === 'installing-binary' && 'Готовлю yt-dlp...'}
              {it.phase === 'starting' && 'Запускаю загрузку...'}
              {it.phase === 'downloading' && 'Скачиваю видео'}
              {it.phase === 'done' && '✓ Сохранено в заметки'}
              {it.phase === 'error' && '⚠ Ошибка'}
            </div>
            {(it.phase === 'fetch-binary' || it.phase === 'downloading') && (
              <div className="dl-toast__bar">
                <div
                  className="dl-toast__bar-fill"
                  style={{
                    width: it.phase === 'downloading'
                      ? `${it.percent || 0}%`
                      : (it.total ? `${(it.received / it.total) * 100}%` : '20%'),
                  }}
                />
              </div>
            )}
            {it.message && <div className="dl-toast__msg">{it.message}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
