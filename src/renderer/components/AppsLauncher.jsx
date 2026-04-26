import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Local launcher panel: searches+launches installed apps/games scanned by
// `apps-scanner.js` (Steam, registry uninstall, Start Menu .lnk). Users can
// create custom folders and tag apps into them; folders are persisted via
// `apps.foldersSet`.

const ALL_FOLDER = { id: '__all__', name: 'Все' };

export default function AppsLauncher({ open, onClose }) {
  const [apps, setApps] = useState([]);
  const [scannedAt, setScannedAt] = useState(0);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState('__all__');
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, app }
  const [dragFolderId, setDragFolderId] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    refresh();
    const off = window.chinazes.apps.onScanProgress(setProgress);
    return () => off?.();
  }, [open]);

  async function refresh() {
    const cache = await window.chinazes.apps.list();
    setApps(cache?.apps || []);
    setScannedAt(cache?.scannedAt || 0);
    const f = await window.chinazes.apps.foldersGet();
    setFolders(f || []);
  }

  async function rescan() {
    setScanning(true);
    setProgress({ phase: 'starting' });
    try {
      const data = await window.chinazes.apps.scan();
      setApps(data.apps || []);
      setScannedAt(data.scannedAt || Date.now());
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  async function persistFolders(next) {
    setFolders(next);
    await window.chinazes.apps.foldersSet(next);
  }

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const id = 'f_' + Date.now().toString(36);
    const next = [...folders, { id, name, appIds: [] }];
    persistFolders(next);
    setNewFolderName('');
    setCreatingFolder(false);
    setActiveFolder(id);
  }
  function deleteFolder(id) {
    if (!confirm('Удалить папку?')) return;
    const next = folders.filter((f) => f.id !== id);
    persistFolders(next);
    if (activeFolder === id) setActiveFolder('__all__');
  }

  function toggleAppInFolder(folderId, appId) {
    const next = folders.map((f) => {
      if (f.id !== folderId) return f;
      const has = f.appIds.includes(appId);
      return { ...f, appIds: has ? f.appIds.filter((x) => x !== appId) : [...f.appIds, appId] };
    });
    persistFolders(next);
  }

  function launch(appItem) {
    window.chinazes.apps.launch(appItem.id);
  }

  async function addManual() {
    const filePath = await window.chinazes.apps.pickFile();
    if (!filePath) return;
    const item = await window.chinazes.apps.addManual({ filePath });
    if (!item) {
      alert('Не удалось добавить файл');
      return;
    }
    await refresh();
    // If we're inside a custom folder, auto-add to it.
    if (activeFolder !== '__all__') {
      const next = folders.map((f) => f.id === activeFolder
        ? { ...f, appIds: f.appIds.includes(item.id) ? f.appIds : [...f.appIds, item.id] }
        : f);
      persistFolders(next);
    }
  }

  async function removeApp(appItem) {
    if (!confirm(`Удалить «${appItem.name}» из лаунчера?`)) return;
    await window.chinazes.apps.remove(appItem.id);
    await refresh();
  }

  function onTileDragStart(e, appItem) {
    e.dataTransfer.setData('application/x-chinazes-app', appItem.id);
    e.dataTransfer.effectAllowed = 'copy';
  }
  function onFolderDragOver(e, folderId) {
    if (folderId === '__all__') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragFolderId(folderId);
  }
  function onFolderDragLeave(e) {
    setDragFolderId(null);
  }
  function onFolderDrop(e, folderId) {
    e.preventDefault();
    setDragFolderId(null);
    if (folderId === '__all__') return;
    const appId = e.dataTransfer.getData('application/x-chinazes-app');
    if (!appId) return;
    const next = folders.map((f) => f.id === folderId
      ? { ...f, appIds: f.appIds.includes(appId) ? f.appIds : [...f.appIds, appId] }
      : f);
    persistFolders(next);
  }

  const filtered = useMemo(() => {
    let list = apps;
    if (activeFolder !== '__all__') {
      const f = folders.find((x) => x.id === activeFolder);
      const ids = new Set(f?.appIds || []);
      list = list.filter((a) => ids.has(a.id));
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [apps, folders, activeFolder, search]);

  // Outside click + esc close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    const onDoc = (e) => {
      if (contextMenu) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [open, onClose, contextMenu]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', close);
      window.addEventListener('contextmenu', close, { once: true });
      return () => window.removeEventListener('click', close);
    }
  }, [contextMenu]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="apps-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="apps-launcher"
            ref={wrapRef}
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
          >
            <header className="apps-launcher__head">
              <input
                className="input apps-launcher__search"
                placeholder="🔍 Поиск приложений и игр..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <button
                className="btn btn--ghost btn--small"
                onClick={addManual}
                title="Добавить приложение по пути"
              >+ Добавить</button>
              <button
                className="btn btn--ghost btn--small"
                onClick={rescan}
                disabled={scanning}
                title="Пересканировать Steam"
              >{scanning ? '...' : '↻ Steam'}</button>
              <button className="modal__close" onClick={onClose}>×</button>
            </header>

            <div className="apps-launcher__body">
              <aside className="apps-folders">
                <FolderItem
                  folder={ALL_FOLDER}
                  active={activeFolder === '__all__'}
                  onClick={() => setActiveFolder('__all__')}
                  count={apps.length}
                />
                {folders.map((f) => (
                  <FolderItem
                    key={f.id}
                    folder={f}
                    active={activeFolder === f.id}
                    dragOver={dragFolderId === f.id}
                    onClick={() => setActiveFolder(f.id)}
                    count={f.appIds.length}
                    onDelete={() => deleteFolder(f.id)}
                    onDragOver={(e) => onFolderDragOver(e, f.id)}
                    onDragLeave={onFolderDragLeave}
                    onDrop={(e) => onFolderDrop(e, f.id)}
                  />
                ))}
                {creatingFolder ? (
                  <div className="apps-folders__new">
                    <input
                      className="input"
                      autoFocus
                      placeholder="Имя папки"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') createFolder();
                        else if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                      }}
                    />
                    <button className="btn btn--primary btn--small" onClick={createFolder}>+</button>
                  </div>
                ) : (
                  <button className="btn btn--ghost btn--small apps-folders__add" onClick={() => setCreatingFolder(true)}>
                    + Папка
                  </button>
                )}
              </aside>

              <main className="apps-grid">
                {scanning && (
                  <div className="apps-grid__progress">
                    {progress?.phase === 'icons'
                      ? `Извлечение иконок ${progress.done || 0}/${progress.total || 0}...`
                      : `Сканирование (${progress?.phase || 'starting'})...`}
                  </div>
                )}
                {!scanning && apps.length === 0 && (
                  <div className="apps-grid__empty">
                    <p>Пока пусто.</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Steam игры подгружаются автоматически. Остальные приложения добавляй вручную.</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                      <button className="btn btn--primary" onClick={rescan}>↻ Сканировать Steam</button>
                      <button className="btn btn--ghost" onClick={addManual}>+ Добавить файл</button>
                    </div>
                  </div>
                )}
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    className="app-tile"
                    draggable
                    onDragStart={(e) => onTileDragStart(e, a)}
                    onDoubleClick={() => launch(a)}
                    onClick={() => launch(a)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, app: a });
                    }}
                    title={`${a.name}\n${a.path || a.steamAppId || ''}\nИсточник: ${a.source}\n(перетащи в папку слева)`}
                  >
                    <div className="app-tile__icon">
                      {a.icon
                        ? <img src={a.icon} alt="" draggable={false} />
                        : <div className="app-tile__icon-fallback">{a.name.slice(0, 1)}</div>}
                      <span className={`app-tile__src app-tile__src--${a.source}`}>
                        {a.source === 'steam' ? 'Steam' : 'App'}
                      </span>
                    </div>
                    <div className="app-tile__name">{a.name}</div>
                  </button>
                ))}
                {!scanning && apps.length > 0 && filtered.length === 0 && (
                  <div className="apps-grid__empty">Ничего не найдено.</div>
                )}
              </main>
            </div>

            <footer className="apps-launcher__foot">
              {apps.length} приложений
              {scannedAt > 0 && ` · отсканировано ${new Date(scannedAt).toLocaleString()}`}
            </footer>

            {contextMenu && (
              <div
                className="apps-ctx"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="apps-ctx__head">{contextMenu.app.name}</div>
                <button className="apps-ctx__item" onClick={() => { launch(contextMenu.app); setContextMenu(null); }}>
                  ▶ Запустить
                </button>
                {contextMenu.app.source === 'manual' && (
                  <button className="apps-ctx__item" onClick={() => { removeApp(contextMenu.app); setContextMenu(null); }}>
                    🗑 Удалить
                  </button>
                )}
                {activeFolder !== '__all__' && (() => {
                  const f = folders.find((x) => x.id === activeFolder);
                  if (!f || !f.appIds.includes(contextMenu.app.id)) return null;
                  return (
                    <button
                      className="apps-ctx__item"
                      onClick={() => {
                        toggleAppInFolder(activeFolder, contextMenu.app.id);
                        setContextMenu(null);
                      }}
                    >✕ Убрать из «{f.name}»</button>
                  );
                })()}
                <div className="apps-ctx__sep">Папки</div>
                {folders.length === 0 && <div className="apps-ctx__hint">Создай папку слева</div>}
                {folders.map((f) => {
                  const has = f.appIds.includes(contextMenu.app.id);
                  return (
                    <button
                      key={f.id}
                      className="apps-ctx__item"
                      onClick={() => toggleAppInFolder(f.id, contextMenu.app.id)}
                    >
                      {has ? '✓ ' : '   '}{f.name}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FolderItem({ folder, active, dragOver, onClick, count, onDelete, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      className={`apps-folder ${active ? 'apps-folder--active' : ''} ${dragOver ? 'apps-folder--dragover' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button className="apps-folder__btn" onClick={onClick}>
        <span className="apps-folder__name">{folder.name}</span>
        <span className="apps-folder__count">{count}</span>
      </button>
      {onDelete && (
        <button className="apps-folder__del" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Удалить папку">×</button>
      )}
    </div>
  );
}
