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
                onClick={rescan}
                disabled={scanning}
                title="Пересканировать ПК"
              >{scanning ? '...' : '↻'}</button>
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
                    onClick={() => setActiveFolder(f.id)}
                    count={f.appIds.length}
                    onDelete={() => deleteFolder(f.id)}
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
                    <p>Пока ничего не отсканировано.</p>
                    <button className="btn btn--primary" onClick={rescan}>Сканировать ПК</button>
                  </div>
                )}
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    className="app-tile"
                    onDoubleClick={() => launch(a)}
                    onClick={() => launch(a)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, app: a });
                    }}
                    title={`${a.name}\n${a.path || a.steamAppId || ''}\nИсточник: ${a.source}`}
                  >
                    <div className="app-tile__icon">
                      {a.icon
                        ? <img src={a.icon} alt="" draggable={false} />
                        : <div className="app-tile__icon-fallback">{a.name.slice(0, 1)}</div>}
                      <span className={`app-tile__src app-tile__src--${a.source}`}>
                        {a.source === 'steam' ? 'Steam' : a.source === 'registry' ? 'App' : 'Меню'}
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

function FolderItem({ folder, active, onClick, count, onDelete }) {
  return (
    <div className={`apps-folder ${active ? 'apps-folder--active' : ''}`}>
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
