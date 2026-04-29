import React, { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NotesPanel({ open, onClose }) {
  const [notes, setNotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [hover, setHover] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { type, url } | null
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const notesListRef = useRef(null);

  // Drag-to-scroll state
  const isDragging = useRef(false);
  const startY = useRef(0);
  const scrollTop = useRef(0);

  const reload = useCallback(async () => {
    try {
      const list = await window.chinazes.notes.list();
      setNotes(list || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  // Refresh when a video download finishes (or any other 'notes:changed' event).
  useEffect(() => {
    if (!window.chinazes?.notes?.onDownloadProgress) return;
    const off = window.chinazes.notes.onDownloadProgress((p) => {
      if (p.phase === 'done') reload();
    });
    return () => off?.();
  }, [reload]);

  // Close on outside click. Backdrop is pointer-events:none (so chats below stay
  // interactive), so we can't rely on backdrop onClick — listen at the document
  // level and check whether the target is inside the panel.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      const panel = document.querySelector('.notes-panel');
      if (panel && !panel.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [open, onClose]);

  // Listen for clipboard paste of images while panel is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      let added = false;
      for (const it of items) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) { await uploadFile(f); added = true; }
        } else if (it.kind === 'string' && it.type === 'text/plain' && !added) {
          // only if no file was pasted
          it.getAsString(async (s) => {
            if (s && s.trim()) { await window.chinazes.notes.add({ text: s }); reload(); }
          });
        }
      }
      if (added) reload();
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open, reload]);

  // ESC key to close lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  // Drag-to-scroll handlers (only middle mouse button)
  const handleMouseDown = (e) => {
    if (e.button !== 1) return; // Only middle mouse button
    // Don't start drag if clicking on interactive elements
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'img' || tag === 'video' || tag === 'button' || tag === 'input' || tag === 'a') return;
    const el = notesListRef.current;
    if (!el) return;
    isDragging.current = true;
    startY.current = e.clientY;
    scrollTop.current = el.scrollTop;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const el = notesListRef.current;
    if (!el) return;
    const deltaY = startY.current - e.clientY;
    el.scrollTop = scrollTop.current + deltaY;
  };

  const handleMouseUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const el = notesListRef.current;
    if (el) el.style.cursor = '';
  };

  async function uploadFile(file) {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      await window.chinazes.notes.add({
        type: typeFromMime(file.type, file.name),
        mime: file.type,
        name: file.name,
        dataBase64: b64,
      });
    } finally { setBusy(false); }
  }

  function typeFromMime(mime, name) {
    const m = (mime || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (m.startsWith('image/gif') || n.endsWith('.gif')) return 'gif';
    if (m.startsWith('image/'))  return 'image';
    if (m.startsWith('video/'))  return 'video';
    if (m.startsWith('audio/'))  return 'audio';
    return 'file';
  }

  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  async function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setHover(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    for (const f of files) await uploadFile(f);
    reload();
  }

  // Track drag over the whole panel using counters (Firefox/Chromium fire
  // dragenter/leave for child elements; counter avoids flicker).
  function onPanelDragEnter(e) {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    dragCounterRef.current += 1;
    setHover(true);
  }
  function onPanelDragLeave() {
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setHover(false);
  }
  function onPanelDragOver(e) {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  async function onAddText() {
    const t = text.trim();
    if (!t) return;
    await window.chinazes.notes.add({ text: t });
    setText('');
    reload();
  }

  async function onCopy(id)   { await window.chinazes.notes.copy(id); }
  async function onRemove(id) { await window.chinazes.notes.remove(id); reload(); }

  // Send image to AI chat for analysis/editing
  function onSendToAI(note) {
    // Dispatch event that AIChatPanel listens to
    window.dispatchEvent(new CustomEvent('chinazes:send-to-ai', {
      detail: {
        imageUrl: note.fileUrl,
        prompt: 'Опиши что на этом изображении и предложи как его можно улучшить или отредактировать.'
      }
    }));
  }

  // Native OS drag — main process initiates webContents.startDrag with file path.
  function onDragStart(id) {
    try { window.chinazes.notes.drag(id); } catch {}
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="notes-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.aside
            className={`notes-panel ${hover ? 'notes-panel--drop-active' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onDragEnter={onPanelDragEnter}
            onDragLeave={onPanelDragLeave}
            onDragOver={onPanelDragOver}
            onDrop={onDrop}
            initial={{ x: 480, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 480, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          >
            <header className="notes-panel__header">
              <h3>📋 Заметки</h3>
              <button className="modal__close" onClick={onClose}>×</button>
            </header>

            <div className="notes-drop">
              <p>Перетащи сюда фото/видео/гифку (или в любое место панели), или вставь из буфера (Ctrl+V).</p>
              <button
                className="btn btn--ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >Выбрать файл</button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                hidden
                onChange={async (e) => {
                  for (const f of Array.from(e.target.files || [])) await uploadFile(f);
                  e.target.value = '';
                  reload();
                }}
              />
            </div>

            <div className="notes-text-row">
              <input
                className="input"
                placeholder="Быстрый текст…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onAddText(); }}
              />
              <button className="btn btn--primary" onClick={onAddText} disabled={!text.trim()}>+</button>
            </div>

            <div
              ref={notesListRef}
              className="notes-list"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {notes.length === 0 && <div className="notes-empty">Пусто. Вставь медиа из буфера или перетащи файл.</div>}
              {notes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  onCopy={() => onCopy(n.id)}
                  onRemove={() => onRemove(n.id)}
                  onDragStart={() => onDragStart(n.id)}
                  onZoom={() => {
                    if (n.type === 'image' || n.type === 'gif' || n.type === 'video') {
                      setLightbox({ type: n.type, url: n.fileUrl });
                    }
                  }}
                  onSendToAI={n.type === 'image' || n.type === 'gif' ? () => onSendToAI(n) : undefined}
                />
              ))}
            </div>
          </motion.aside>

          {lightbox && (
            <motion.div
              className="note-lightbox"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="note-lightbox__backdrop" onClick={() => setLightbox(null)} />
              {(lightbox.type === 'image' || lightbox.type === 'gif') && (
                <img
                  src={lightbox.url}
                  alt=""
                  onClick={(e) => e.stopPropagation()}
                  draggable={false}
                />
              )}
              {lightbox.type === 'video' && (
                <video
                  src={lightbox.url}
                  controls
                  autoPlay
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <button className="note-lightbox__close" onClick={() => setLightbox(null)}>×</button>
              <div className="note-lightbox__hint">ESC или клик вне изображения — закрыть</div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NoteCard({ note, onCopy, onRemove, onDragStart, onZoom, onSendToAI }) {
  const isMedia = note.type === 'image' || note.type === 'gif' || note.type === 'video';
  const isImage = note.type === 'image' || note.type === 'gif';
  return (
    <div
      className="note-card"
      draggable={!!note.fileUrl}
      onDragStart={onDragStart}
    >
      <div className="note-card__preview" onClick={isMedia ? onZoom : undefined}>
        {note.type === 'text' && <pre className="note-card__text">{note.text}</pre>}
        {(note.type === 'image' || note.type === 'gif') && (
          <img src={note.fileUrl} alt={note.label} />
        )}
        {note.type === 'video' && (
          <video src={note.fileUrl} preload="metadata" muted />
        )}
        {note.type === 'audio' && (
          <audio src={note.fileUrl} controls />
        )}
        {note.type === 'file' && (
          <div className="note-card__file">📄 {note.label}</div>
        )}
      </div>
      <div className="note-card__actions">
        <span className="note-card__label" title={note.label}>{note.label}</span>
        <div className="note-card__btns">
          <button className="btn btn--mini" onClick={onCopy} title="Copy to clipboard">📋</button>
          {isImage && onSendToAI && (
            <button className="btn btn--mini" onClick={onSendToAI} title="Отправить в AI">✨</button>
          )}
          {isMedia && <span className="note-card__hint" title="Drag to chat">⤴</span>}
          <button className="btn btn--mini btn--danger" onClick={onRemove} title="Delete">🗑</button>
        </div>
      </div>
    </div>
  );
}
