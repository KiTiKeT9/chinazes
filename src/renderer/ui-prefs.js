// User-tunable UI preferences: sidebar icon size + which "extra" launchers
// (Co-browse, Apps, AI, Notes) are visible. Persisted in localStorage and
// applied to the document root via CSS variables.

const KEY = 'chinazes:ui-prefs:v1';

export const SIDEBAR_SIZES = {
  small:  { sidebar: 60, tab: 40, icon: 18, radius: 12 },
  medium: { sidebar: 78, tab: 54, icon: 22, radius: 16 },
  large:  { sidebar: 96, tab: 68, icon: 28, radius: 20 },
};

const DEFAULTS = {
  sidebarSize: 'medium',
  features: {
    cobrowse: true,
    apps: true,
    ai: true,
    notes: true,
  },
};

export function loadUIPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
    return {
      sidebarSize: SIDEBAR_SIZES[raw.sidebarSize] ? raw.sidebarSize : DEFAULTS.sidebarSize,
      features: { ...DEFAULTS.features, ...(raw.features || {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveUIPrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
  applyUIPrefs(prefs);
  window.dispatchEvent(new CustomEvent('chinazes:ui-prefs', { detail: prefs }));
}

export function applyUIPrefs(prefs = loadUIPrefs()) {
  const size = SIDEBAR_SIZES[prefs.sidebarSize] || SIDEBAR_SIZES.medium;
  const root = document.documentElement;
  root.style.setProperty('--sidebar-w', `${size.sidebar}px`);
  root.style.setProperty('--tab-size', `${size.tab}px`);
  root.style.setProperty('--tab-icon', `${size.icon}px`);
  root.style.setProperty('--tab-radius', `${size.radius}px`);
}

export function onUIPrefsChange(cb) {
  const handler = (e) => cb(e.detail);
  window.addEventListener('chinazes:ui-prefs', handler);
  return () => window.removeEventListener('chinazes:ui-prefs', handler);
}
