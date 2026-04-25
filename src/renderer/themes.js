// Theme presets — applied via CSS custom properties on document.documentElement.
// Each theme overrides base colors; per-service `--accent`/`--accent-gradient`
// still wins inside service views (set on .app element).

export const THEMES = [
  {
    id: 'midnight',
    name: 'Midnight',
    desc: 'Стандартная тёмно-синяя',
    vars: {
      '--bg':    '#0b0b10',
      '--bg-2':  '#111118',
      '--bg-3':  '#171722',
      '--fg':    '#e6e8ff',
      '--fg-dim':  'rgba(230, 232, 255, 0.6)',
      '--fg-mute': 'rgba(230, 232, 255, 0.35)',
      '--border':  'rgba(255, 255, 255, 0.07)',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    desc: 'Нейтральный графитовый',
    vars: {
      '--bg':    '#0a0a0a',
      '--bg-2':  '#141414',
      '--bg-3':  '#1c1c1c',
      '--fg':    '#ededed',
      '--fg-dim':  'rgba(237, 237, 237, 0.62)',
      '--fg-mute': 'rgba(237, 237, 237, 0.36)',
      '--border':  'rgba(255, 255, 255, 0.08)',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    desc: 'Глубокий зелёный',
    vars: {
      '--bg':    '#06120c',
      '--bg-2':  '#0c1f15',
      '--bg-3':  '#142c1d',
      '--fg':    '#e6f5ea',
      '--fg-dim':  'rgba(220, 245, 225, 0.62)',
      '--fg-mute': 'rgba(220, 245, 225, 0.36)',
      '--border':  'rgba(140, 220, 170, 0.10)',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    desc: 'Тёмно-розовый с тёплыми акцентами',
    vars: {
      '--bg':    '#180a16',
      '--bg-2':  '#241224',
      '--bg-3':  '#2f1a30',
      '--fg':    '#fbe7f1',
      '--fg-dim':  'rgba(255, 220, 235, 0.65)',
      '--fg-mute': 'rgba(255, 220, 235, 0.38)',
      '--border':  'rgba(255, 180, 210, 0.10)',
    },
  },
  {
    id: 'mocha',
    name: 'Mocha',
    desc: 'Кофейный, тёплый коричневый',
    vars: {
      '--bg':    '#1a0f08',
      '--bg-2':  '#251710',
      '--bg-3':  '#321f18',
      '--fg':    '#f3e2cb',
      '--fg-dim':  'rgba(243, 226, 203, 0.6)',
      '--fg-mute': 'rgba(243, 226, 203, 0.36)',
      '--border':  'rgba(220, 180, 140, 0.10)',
    },
  },
  {
    id: 'cyber',
    name: 'Cyber',
    desc: 'Высокий контраст, неон',
    vars: {
      '--bg':    '#04050d',
      '--bg-2':  '#0a0d22',
      '--bg-3':  '#101535',
      '--fg':    '#dafaff',
      '--fg-dim':  'rgba(218, 250, 255, 0.62)',
      '--fg-mute': 'rgba(218, 250, 255, 0.38)',
      '--border':  'rgba(80, 200, 255, 0.16)',
    },
  },
  {
    id: 'light',
    name: 'Light',
    desc: 'Светлая (экспериментально)',
    vars: {
      '--bg':    '#f6f7fb',
      '--bg-2':  '#ffffff',
      '--bg-3':  '#eef0f7',
      '--fg':    '#1a1c2a',
      '--fg-dim':  'rgba(26, 28, 42, 0.7)',
      '--fg-mute': 'rgba(26, 28, 42, 0.45)',
      '--border':  'rgba(0, 0, 0, 0.10)',
    },
  },
];

const STORAGE_KEY = 'chinazes:theme';

export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  return theme;
}

export function getStoredTheme() {
  return localStorage.getItem(STORAGE_KEY) || THEMES[0].id;
}

export function setStoredTheme(id) {
  localStorage.setItem(STORAGE_KEY, id);
  applyTheme(id);
}
