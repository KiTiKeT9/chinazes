// Service preferences — runtime resolution of which services appear in the sidebar.
// Combines built-in services from `services.js` with user-added custom ones, then
// removes any that the user hid via Settings.

import { SERVICES as BUILTIN } from './services.js';

const HIDDEN_KEY = 'chinazes:hidden-services';
const CUSTOM_KEY = 'chinazes:custom-services';

export function loadHidden() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

export function saveHidden(set) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch {}
}

export function loadCustom() {
  try {
    const arr = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.id === 'string' && typeof s.url === 'string')
      .map(normalizeCustom);
  } catch { return []; }
}

export function saveCustom(arr) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr)); } catch {}
}

function normalizeCustom(s) {
  return {
    id: s.id,
    name: s.name || s.id,
    url: s.url,
    partition: s.partition || `persist:custom-${s.id}`,
    accent: s.accent || '#7e8efb',
    gradient: s.gradient || `linear-gradient(135deg, #7e8efb 0%, #5060c8 100%)`,
    icon: s.icon || null,            // brand-icon id or null
    iconUrl: s.iconUrl || null,      // arbitrary http(s) url (e.g. favicon)
    custom: true,
  };
}

// Public API: list services in sidebar, in current order, with hidden filtered out.
export function resolveServices() {
  const custom = loadCustom();
  const all = [...BUILTIN, ...custom];
  return all;
}

export function visibleServices() {
  const hidden = loadHidden();
  return resolveServices().filter((s) => !hidden.has(s.id));
}

// Append a new custom service. Auto-generates id from URL hostname.
export function addCustomService({ name, url, accent, iconUrl }) {
  const u = new URL(url);
  const baseId = u.hostname.replace(/^www\./, '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const existing = new Set([...BUILTIN.map((s) => s.id), ...loadCustom().map((s) => s.id)]);
  let id = baseId;
  let n = 2;
  while (existing.has(id)) { id = `${baseId}-${n++}`; }
  const entry = normalizeCustom({
    id,
    name: name || u.hostname,
    url,
    accent,
    iconUrl: iconUrl || `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`,
  });
  const arr = [...loadCustom(), entry];
  saveCustom(arr);
  return entry;
}

export function removeCustomService(id) {
  const arr = loadCustom().filter((s) => s.id !== id);
  saveCustom(arr);
}
