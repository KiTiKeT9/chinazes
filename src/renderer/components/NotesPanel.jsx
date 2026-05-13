import React, { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STORE_KEY = 'chinazes:note-categories';
const DEFAULT_CATS = ['Видео', 'Фото', 'Ссылки', 'Разное'];

function loadCats() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
  } catch {}
  return DEFAULT_CATS;
}

export default function NotesPanel({ open, onClose }) {
  const [notes, setNotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [hover, setHover] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [cats, setCats] = useState(loadCats);
  const [newCatName, setNewCatName] = useState('');
  const [showCatManager, setShowCatManager] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const notesListRef = useRef(null);

  const isDragging = useRef(false);
  const startY = useRef(0);
  const scrollTop = useRef(0);

  const reload = useCallback(async () => {
    try {
      const list = await window.chinazes.notes.list();
      setNotes(list || []);
      const c = await window.chinazes.notes.getCategories();
      if (Array.isArray(c) && c.length) setCats(c);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  useEffect(() => {
    if (!window.chinazes?.notes?.onDownloadProgress) return;
    const off = window.chinazes.notes.onDownloadProgress((p) => {
      if (p.phase === 'done') reload();
    });
    return () => off?.();
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      const panel = document.querySelector('.notes-panel');
      if (panel && !panel.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [open, onClose]);

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

  useEffect(() => {
    if (!lightbox) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLightbox(null); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [lightbox]);

  const handleMouseDown = (e) => {
    if (e.button !== 1) return;
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
    if (el) el.scrollTop = scrollTop.current + (startY.current - e.clientY);
  };
  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (notesListRef.current) notesListRef.current.style.cursor = '';
  };

  const onPanelDragEnter = (e) => { e.preventDefault(); dragCounterRef.current++; setHover(true); };
  const onPanelDragLeave = () => { dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setHover(false); } };
  const onPanelDragOver = (e) => { e.preventDefault(); };
  const onDrop = async (e) => {
    e.preventDefault(); setHover(false); dragCounterRef.current = 0;
    for (const f of Array.from(e.dataTransfer.files || [])) await uploadFile(f);
    reload();
  };

  function autoCat(note) {
    if (note.type === 'video') return 'Видео';
    if (note.type === 'image' || note.type === 'gif') return 'Фото';
    if (note.text && /https?:\/\//.test(note.text)) return 'Ссылки';
    return 'Разное';
  }

  async function onAddText() {
    const t = text.trim();
    if (!t) return;
    setText('');
    const cat = activeCat !== 'all' ? activeCat : (t.match(/https?:\/\//) ? 'Ссылки' : 'Разное');
    await window.chinazes.notes.add({ text: t, category: cat });
    reload();
  }

  async function uploadFile(f) {
    if (!f) return;
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const type = f.type?.startsWith('image/') ? 'image' : f.type?.startsWith('video/') ? 'video' : 'file';
      const cat = activeCat !== 'all' ? activeCat : (type === 'video' ? 'Видео' : type === 'image' ? 'Фото' : 'Разное');
      await window.chinazes.notes.add({
        name: f.name, type, mime: f.type, dataBase64: base64, label: f.name, category: cat,
      });
    } catch (e) { console.error(e); }
    setBusy(false);
  }

  async function onCopy(id)   { try { await window.chinazes.notes.copy(id); } catch (e) { console.warn('[notes] copy failed', e); } }
  async function onRemove(id) { try { await window.chinazes.notes.remove(id); } catch (e) { console.warn('[notes] remove failed', e); } reload(); }
  async function onRename(id, label) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, label } : n)));
    try { await window.chinazes.notes.rename(id, label); } catch (e) { console.warn('[notes] rename failed', e); }
    reload();
  }
  async function onSetCat(id, cat) {
    // Optimistic local update: update notes in state immediately
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, category: cat || undefined } : n)));
    try { await window.chinazes.notes.setCategory(id, cat); } catch (e) { console.warn('[notes] setCategory failed', e); }
    reload();
  }

  function extractUrl(text) {
    if (!text) return null;
    const m = text.match(/https?:\/\/[^\s"'<>]+/);
    if (!m) return null;
    const original = m[0];
    const isYT = /(?:youtube\.com|youtu\.be)/i.test(original);
    return { type: isYT ? 'youtube' : 'other', original };
  }

  function onSendToAI(note) {
    window.dispatchEvent(new CustomEvent('chinazes:send-to-ai', {
      detail: {
        imageUrl: note.fileUrl,
        prompt: 'Опиши что на этом изображении и предложи как его можно улучшить или отредактировать.'
      }
    }));
  }

  function onDragStart(id) {
    try { window.chinazes.notes.drag(id); } catch {}
  }

  // Filter notes by search + category
  const filtered = notes.filter((n) => {
    if (activeCat !== 'all' && n.category !== activeCat) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = (n.label || '').toLowerCase();
      const textContent = (n.text || '').toLowerCase();
      if (!label.includes(q) && !textContent.includes(q)) return false;
    }
    return true;
  });

  async function addNewCat() {
    const n = newCatName.trim();
    if (!n || cats.includes(n)) return;
    await window.chinazes.notes.addCategory(n);
    setCats((prev) => [...prev, n]);
    setNewCatName('');
  }

  async function delCat(name) {
    await window.chinazes.notes.removeCategory(name);
    setCats((prev) => prev.filter((c) => c !== name));
    if (activeCat === name) setActiveCat('all');
  }

  return (<>
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
              <p>Перетащи сюда фото/видео/гифку, или вставь из буфера (Ctrl+V).</p>
              <button className="btn btn--ghost" onClick={() => fileInputRef.current?.click()} disabled={busy}>Выбрать файл</button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={async (e) => {
                for (const f of Array.from(e.target.files || [])) await uploadFile(f);
                e.target.value = '';
                reload();
              }} />
            </div>

            <div className="notes-text-row">
              <input className="input" placeholder="Быстрый текст…" value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onAddText(); }} />
              <button className="btn btn--primary" onClick={onAddText} disabled={!text.trim()}>+</button>
            </div>

            {/* Search */}
            <div className="notes-search-row">
              <input className="input" placeholder="🔍 Поиск по названию…" value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>

            {/* Category tabs */}
            <div className="notes-cats">
              <button className={`notes-cat ${activeCat === 'all' ? 'notes-cat--active' : ''}`}
                onClick={() => setActiveCat('all')}>Все</button>
              {cats.map((c) => (
                <button key={c} className={`notes-cat ${activeCat === c ? 'notes-cat--active' : ''}`}
                  onClick={() => setActiveCat(c)}>{c}</button>
              ))}
              <button className="notes-cat notes-cat--manage" onClick={() => setShowCatManager(!showCatManager)}
                title="Управление категориями">⚙</button>
            </div>

            {/* Category manager */}
            <AnimatePresence>
              {showCatManager && (
                <motion.div className="notes-cat-mgr" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <div className="notes-cat-mgr__row">
                    <input className="input" placeholder="Новая категория…" value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addNewCat(); }} />
                    <button className="btn btn--primary btn--small" onClick={addNewCat} disabled={!newCatName.trim()}>+</button>
                  </div>
                  <div className="notes-cat-mgr__list">
                    {cats.map((c) => (
                      <div key={c} className="notes-cat-mgr__item">
                        <span>{c}</span>
                        <button className="btn btn--mini btn--danger" onClick={() => delCat(c)}
                          title="Удалить категорию">×</button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={notesListRef} className="notes-list"
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
              {filtered.length === 0 && <div className="notes-empty">
                {search ? 'Ничего не найдено.' : 'Пусто. Вставь медиа из буфера или перетащи файл.'}
              </div>}
              {filtered.map((n) => (
                <NoteCard
                  key={n.id} note={n}
                  cats={cats}
                  onCopy={() => onCopy(n.id)}
                  onRemove={() => onRemove(n.id)}
                  onRename={(label) => onRename(n.id, label)}
                  onSetCat={(cat) => onSetCat(n.id, cat)}
                  onDragStart={() => onDragStart(n.id)}
                  onZoom={() => {
                    if (n.type === 'image' || n.type === 'gif' || n.type === 'video')
                      setLightbox({ type: n.type, url: n.fileUrl });
                  }}
                  onSendToAI={n.type === 'image' || n.type === 'gif' ? () => onSendToAI(n) : undefined}
                  onPreviewLink={n.type === 'text' ? () => {
                    const info = extractUrl(n.text);
                    if (!info) return;
                    if (info.type === 'youtube') {
                      window.chinazes?.youtubeMiniPlayer?.open(info.original).catch(() => window.open(info.original, '_blank', 'noopener'));
                    } else {
                      window.open(info.original, '_blank', 'noopener');
                    }
                  } : undefined}
                  onDownloadVideo={n.type === 'text' && /youtu/.test(n.text) ? () => {
                    const info = extractUrl(n.text);
                    if (info?.original) window.chinazes?.notes?.downloadVideo?.(info.original);
                  } : undefined}
                />
              ))}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
    {lightbox && (
      <div className="note-lightbox" onClick={() => setLightbox(null)}>
        <div className="note-lightbox__backdrop" />
        {(lightbox.type === 'image' || lightbox.type === 'gif') && (
          <img src={lightbox.url} alt="" onClick={(e) => e.stopPropagation()} draggable={false} />
        )}
        {lightbox.type === 'video' && (
          <video src={lightbox.url} controls autoPlay onClick={(e) => e.stopPropagation()} />
        )}
        <button className="note-lightbox__close" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>×</button>
        <div className="note-lightbox__hint">ESC или клик вне изображения — закрыть</div>
      </div>
    )}
  </>);
}

function NoteCard({ note, cats, onCopy, onRemove, onRename, onSetCat, onDragStart, onZoom, onSendToAI, onPreviewLink, onDownloadVideo }) {
  const isMedia = note.type === 'image' || note.type === 'gif' || note.type === 'video';
  const isImage = note.type === 'image' || note.type === 'gif';
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(note.label || '');
  const [showCatPicker, setShowCatPicker] = useState(false);

  function handleRename() {
    const v = editVal.trim();
    if (v && v !== (note.label || '')) onRename(v);
    setEditing(false);
  }

  return (
    <div className="note-card" draggable={!!note.fileUrl} onDragStart={onDragStart}>
      <div className="note-card__preview" onClick={isMedia ? onZoom : undefined}>
        {note.type === 'text' && <pre className="note-card__text">{note.text}</pre>}
        {(note.type === 'image' || note.type === 'gif') && <img src={note.fileUrl} alt={note.label} />}
        {note.type === 'video' && <video src={note.fileUrl} preload="metadata" muted />}
        {note.type === 'audio' && <audio src={note.fileUrl} controls />}
        {note.type === 'file' && <div className="note-card__file">📄 {note.label}</div>}
      </div>
      <div className="note-card__actions">
        {editing ? (
          <input className="input note-card__rename-input" value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
          />
        ) : (
          <>
            <span className="note-card__label" title={note.label} onDoubleClick={() => { setEditVal(note.label || ''); setEditing(true); }}>
              {note.label}
              {note.category && <span className="note-card__cat-tag">{note.category}</span>}
            </span>
            <div className="note-card__btns">
              <button className="btn btn--mini" onClick={onCopy} title="Копировать">📋</button>
              <button className="btn btn--mini" onClick={() => { setEditVal(note.label || ''); setEditing(true); }} title="Переименовать">✏</button>
              {onPreviewLink && (
                <button className="btn btn--mini" onClick={onPreviewLink} title="Открыть превью ссылки">🔗</button>
              )}
              {onDownloadVideo && (
                <button className="btn btn--mini" onClick={onDownloadVideo} title="Скачать видео в заметки">📥</button>
              )}
              {isImage && onSendToAI && (
                <button className="btn btn--mini" onClick={onSendToAI} title="Отправить в AI">✨</button>
              )}
              {isMedia && <span className="note-card__hint" title="Перетащи в чат">⤴</span>}
              <button className="btn btn--mini" onClick={() => setShowCatPicker(!showCatPicker)} title="Категория">🏷</button>
              <button className="btn btn--mini btn--danger" onClick={onRemove} title="Удалить">🗑</button>
            </div>
            {showCatPicker && (
              <div className="note-card__cat-picker" onClick={(e) => e.stopPropagation()}>
                <button className={`btn btn--mini ${!note.category ? 'btn--primary' : ''}`}
                  onClick={() => { onSetCat(''); setShowCatPicker(false); }}>Без</button>
                {cats.map((c) => (
                  <button key={c} className={`btn btn--mini ${note.category === c ? 'btn--primary' : ''}`}
                    onClick={() => { onSetCat(c); setShowCatPicker(false); }}>{c}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
