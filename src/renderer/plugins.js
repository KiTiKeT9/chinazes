// Plugin model + storage + injection runtime.
//
// A plugin is { id, name, description, target, css, js, builtin?, enabled }.
//   target  — service id ('telegram', 'youtube', '*' for any)
//   css     — string injected via webview.insertCSS on dom-ready
//   js      — string evaluated via webview.executeJavaScript on dom-ready
//
// Built-in plugins ship in code; custom plugins live in localStorage. Both go
// through the same toggle/enabled flag and the same injection pipeline in
// `applyPlugins(webview, serviceId)`.

const STORE_KEY = 'chinazes:plugins';

export const BUILTIN_PLUGINS = [
  {
    id: 'youtube-hide-shorts',
    name: 'YouTube · скрыть Shorts',
    description: 'Прячет вкладку Shorts в сайдбаре и блок Shorts на главной.',
    target: 'youtube',
    css: `
      ytd-guide-entry-renderer a[title="Shorts"],
      ytd-mini-guide-entry-renderer[aria-label="Shorts"],
      ytd-rich-section-renderer:has([is-shorts]),
      ytd-reel-shelf-renderer { display: none !important; }
    `,
    js: '',
  },
  {
    id: 'youtube-cinematic-off',
    name: 'YouTube · отключить cinematic-фон',
    description: 'Убирает размытие/градиент за плеером — экономит CPU/GPU.',
    target: 'youtube',
    css: `
      #cinematics, .ytp-cinematics-container { display: none !important; }
    `,
    js: '',
  },
  {
    id: 'twitch-hide-recommendations',
    name: 'Twitch · убрать рекомендации',
    description: 'Скрывает «Рекомендованные стримы» на главной.',
    target: 'twitch',
    css: `
      [data-a-target="side-nav-recommended-section"],
      [data-a-target="discover-recommended"] { display: none !important; }
    `,
    js: '',
  },
  {
    id: 'discord-compact-sidebar',
    name: 'Discord · компактный сайдбар',
    description: 'Уменьшает иконки серверов до 36 px — больше серверов влезает.',
    target: 'discord',
    css: `
      [data-list-id="guildsnav"] [class*="listItem-"] { height: 38px !important; }
      [data-list-id="guildsnav"] [class*="wrapper-"] { width: 36px !important; height: 36px !important; }
    `,
    js: '',
  },
  {
    id: 'discord-no-nag',
    name: 'Discord · скрыть «Скачать приложение»',
    description: 'Прячет баннер с предложением скачать native-клиент.',
    target: 'discord',
    css: `
      [class*="notice-"][class*="downloadApp-"],
      [class*="downloadApp-"] { display: none !important; }
    `,
    js: '',
  },
  {
    id: 'telegram-rounded-bubbles',
    name: 'Telegram · скруглённые пузыри',
    description: 'Усиливает скругление сообщений до 18 px.',
    target: 'telegram',
    css: `
      .Message .content-inner, .message .bubble { border-radius: 18px !important; }
    `,
    js: '',
  },
  {
    id: 'global-block-mediastudio-prompts',
    name: 'Глобально · убирать «вы покинете сайт»',
    description: 'Подавляет beforeunload-диалоги при закрытии вкладки.',
    target: '*',
    css: '',
    js: `window.addEventListener('beforeunload', (e) => { e.stopImmediatePropagation(); }, true);`,
  },
  {
    id: 'global-zoom-images',
    name: 'Глобально · zoom картинок по double-click',
    description: 'Двойной клик по любой <img> открывает её в полный экран.',
    target: '*',
    css: `
      .__chinazes-zoom { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 999999;
        display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
      .__chinazes-zoom img { max-width: 92vw; max-height: 92vh; box-shadow: 0 20px 60px rgba(0,0,0,0.8); }
    `,
    js: `
      (function () {
        if (window.__chinazesZoomInstalled) return;
        window.__chinazesZoomInstalled = true;
        document.addEventListener('dblclick', (e) => {
          const img = e.target && e.target.tagName === 'IMG' ? e.target : null;
          if (!img || !img.src) return;
          const overlay = document.createElement('div');
          overlay.className = '__chinazes-zoom';
          const big = document.createElement('img');
          big.src = img.src;
          overlay.appendChild(big);
          overlay.addEventListener('click', () => overlay.remove());
          document.body.appendChild(overlay);
        }, true);
      })();
    `,
  },
];

export function loadPlugins() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && Array.isArray(raw.list)) {
      // Merge built-ins (so newly added built-ins appear automatically) with
      // saved enabled state + any user customs.
      const savedById = new Map(raw.list.map((p) => [p.id, p]));
      const merged = [];
      for (const b of BUILTIN_PLUGINS) {
        const saved = savedById.get(b.id);
        merged.push({ ...b, builtin: true, enabled: saved ? !!saved.enabled : false });
        savedById.delete(b.id);
      }
      for (const custom of savedById.values()) {
        merged.push({ ...custom, builtin: false });
      }
      return merged;
    }
  } catch {}
  return BUILTIN_PLUGINS.map((p) => ({ ...p, builtin: true, enabled: false }));
}

export function savePlugins(list) {
  try {
    // Save only enabled flag for built-ins; full record for customs.
    const trimmed = list.map((p) =>
      p.builtin
        ? { id: p.id, enabled: !!p.enabled }
        : { id: p.id, name: p.name, description: p.description, target: p.target, css: p.css, js: p.js, enabled: !!p.enabled }
    );
    localStorage.setItem(STORE_KEY, JSON.stringify({ list: trimmed }));
  } catch {}
}

export function addCustomPlugin({ name, description, target, css, js }) {
  const list = loadPlugins();
  const baseId = (name || 'plugin').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plugin';
  let id = `custom-${baseId}`;
  let n = 2;
  const ids = new Set(list.map((p) => p.id));
  while (ids.has(id)) { id = `custom-${baseId}-${n++}`; }
  const entry = {
    id,
    name: name || 'Custom plugin',
    description: description || '',
    target: target || '*',
    css: css || '',
    js: js || '',
    builtin: false,
    enabled: true,
  };
  savePlugins([...list, entry]);
  return entry;
}

export function removePlugin(id) {
  const list = loadPlugins().filter((p) => p.id !== id);
  savePlugins(list);
}

export function setEnabled(id, enabled) {
  const list = loadPlugins().map((p) => (p.id === id ? { ...p, enabled } : p));
  savePlugins(list);
}

export function updateCustomPlugin(id, patch) {
  const list = loadPlugins().map((p) => (p.id === id && !p.builtin ? { ...p, ...patch } : p));
  savePlugins(list);
}

// Apply enabled plugins to a webview. Call on dom-ready / did-navigate.
export async function applyPlugins(webview, serviceId) {
  if (!webview) return;
  const list = loadPlugins().filter((p) =>
    p.enabled && (p.target === '*' || p.target === serviceId)
  );
  for (const p of list) {
    try {
      if (p.css && webview.insertCSS) await webview.insertCSS(p.css);
    } catch (e) { console.warn(`[plugin ${p.id}] css failed`, e); }
    try {
      if (p.js && webview.executeJavaScript) {
        // Wrap in IIFE so plugins can't leak local vars.
        await webview.executeJavaScript(`(function(){try{${p.js}}catch(e){console.error('[chinazes-plugin]', e);}})();`, true);
      }
    } catch (e) { console.warn(`[plugin ${p.id}] js failed`, e); }
  }
}
