import React, { useEffect, useMemo, useState } from 'react';

// Personal organizer — a dashboard of user-added links/notes/tickets.
// Persists to localStorage. Each item: { id, title, url, color, group, ts }.

const STORE_KEY = 'chinazes:organizer-items';
const GROUPS_KEY = 'chinazes:organizer-groups';
const DEFAULT_GROUPS = ['Работа', 'Учёба', 'Личное', 'Развлечения'];

function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function saveItems(items) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(items)); } catch {}
}
function loadGroups() {
  try {
    const raw = JSON.parse(localStorage.getItem(GROUPS_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) return raw;
  } catch {}
  return DEFAULT_GROUPS;
}
function saveGroups(groups) {
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch {}
}

function faviconFor(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}`;
  } catch { return ''; }
}

function normalizeUrl(input) {
  const s = (input || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+\.[\w.-]+/.test(s)) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

const COLORS = ['#0077FF', '#4ade80', '#ffd166', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#ec4899'];

export default function OrganizerPanel({ visible }) {
  const [items, setItems]   = useState(loadItems);
  const [groups, setGroups] = useState(loadGroups);
  const [filter, setFilter] = useState('');
  const [activeGroup, setActiveGroup] = useState('all');
  const [editing, setEditing] = useState(null);   // null | 'new' | <itemId>
  const [draft, setDraft]   = useState({ title: '', url: '', group: '', color: COLORS[0] });
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => { saveItems(items); }, [items]);
  useEffect(() => { saveGroups(groups); }, [groups]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((it) => {
      if (activeGroup !== 'all' && it.group !== activeGroup) return false;
      if (!q) return true;
      return [it.title, it.url, it.group].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [items, filter, activeGroup]);

  function startNew() {
    setDraft({ title: '', url: '', group: groups[0] || '', color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    setEditing('new');
  }
  function startEdit(item) {
    setDraft({ title: item.title, url: item.url, group: item.group || '', color: item.color || COLORS[0] });
    setEditing(item.id);
  }
  function cancel() { setEditing(null); }
  function save() {
    const url = normalizeUrl(draft.url);
    if (!url) return;
    const title = draft.title.trim() || url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '');
    if (editing === 'new') {
      setItems((cur) => [
        { id: `i_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title, url, group: draft.group, color: draft.color, ts: Date.now() },
        ...cur,
      ]);
    } else {
      setItems((cur) => cur.map((it) => it.id === editing ? { ...it, title, url, group: draft.group, color: draft.color } : it));
    }
    setEditing(null);
  }
  function remove(id) {
    if (!confirm('Удалить ссылку?')) return;
    setItems((cur) => cur.filter((it) => it.id !== id));
  }
  function open(it) {
    // Open in default browser for now (no easy way to open in Chinazes webview without service id).
    try { window.open(it.url, '_blank'); } catch {}
  }
  function commitNewGroup() {
    const n = newGroupName.trim();
    if (n && !groups.includes(n)) setGroups((g) => [...g, n]);
    setAddingGroup(false);
    setNewGroupName('');
  }
  function removeGroup(name) {
    if (!window.confirm(`Удалить группу «${name}»? Ссылки останутся, но без группы.`)) return;
    setGroups((g) => g.filter((x) => x !== name));
    setItems((cur) => cur.map((it) => it.group === name ? { ...it, group: '' } : it));
    if (activeGroup === name) setActiveGroup('all');
  }

  if (!visible) return null;

  return (
    <div className="organizer">
      <div className="organizer__header">
        <div>
          <h1 className="organizer__title">Органайзер</h1>
          <p className="organizer__subtitle">Свои ссылки, заметки и быстрый доступ</p>
        </div>
        <button className="organizer__add" onClick={startNew}>＋ Добавить ссылку</button>
      </div>

      <div className="organizer__toolbar">
        <input
          className="organizer__search"
          type="search"
          placeholder="Поиск…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="organizer__groups">
          <button
            className={`organizer__group ${activeGroup === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveGroup('all')}
          >Все ({items.length})</button>
          {groups.map((g) => (
            <button
              key={g}
              className={`organizer__group ${activeGroup === g ? 'is-active' : ''}`}
              onClick={() => setActiveGroup(g)}
              onContextMenu={(e) => { e.preventDefault(); removeGroup(g); }}
              title="ПКМ — удалить группу"
            >
              {g} ({items.filter((it) => it.group === g).length})
            </button>
          ))}
          {addingGroup ? (
            <input
              autoFocus
              className="organizer__group-input"
              placeholder="Имя группы…"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNewGroup();
                if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName(''); }
              }}
              onBlur={commitNewGroup}
            />
          ) : (
            <button className="organizer__group organizer__group--add" onClick={() => setAddingGroup(true)}>＋ группа</button>
          )}
        </div>
      </div>

      <div className="organizer__grid">
        {filtered.length === 0 && (
          <div className="organizer__empty">
            <div style={{ fontSize: 48, marginBottom: 10 }}>🔖</div>
            <h3>{items.length ? 'Ничего не найдено' : 'Пока пусто'}</h3>
            <p>{items.length ? 'Поменяй фильтр или группу' : 'Добавь первую ссылку — кнопка справа сверху'}</p>
          </div>
        )}
        {filtered.map((it) => (
          <div key={it.id} className="ocard" style={{ '--ocolor': it.color || '#0077FF' }}>
            <button className="ocard__open" onClick={() => open(it)}>
              <div className="ocard__icon">
                {it.url
                  ? <img src={faviconFor(it.url)} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                  : null}
              </div>
              <div className="ocard__body">
                <div className="ocard__title">{it.title}</div>
                <div className="ocard__url">{it.url.replace(/^https?:\/\//i, '')}</div>
                {it.group && <div className="ocard__group">{it.group}</div>}
              </div>
            </button>
            <div className="ocard__actions">
              <button className="ocard__btn" onClick={() => startEdit(it)} title="Редактировать">✏️</button>
              <button className="ocard__btn ocard__btn--danger" onClick={() => remove(it.id)} title="Удалить">🗑</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="organizer__modal" onClick={cancel}>
          <div className="organizer__modal-body" onClick={(e) => e.stopPropagation()}>
            <h3>{editing === 'new' ? 'Новая ссылка' : 'Редактировать'}</h3>
            <label>
              <span>URL</span>
              <input
                autoFocus
                placeholder="https://example.com или просто example.com"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
            </label>
            <label>
              <span>Название</span>
              <input
                placeholder="Auto"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
            </label>
            <label>
              <span>Группа</span>
              <select value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })}>
                <option value="">— без группы —</option>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <div>
              <span style={{ fontSize: 12, opacity: 0.6 }}>Цвет</span>
              <div className="organizer__colors">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`organizer__color ${draft.color === c ? 'is-active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setDraft({ ...draft, color: c })}
                  />
                ))}
              </div>
            </div>
            <div className="organizer__modal-actions">
              <button className="btn btn--ghost" onClick={cancel}>Отмена</button>
              <button className="btn btn--primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
