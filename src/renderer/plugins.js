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
    id: 'youtube-downloader',
    name: 'YouTube · скачать в заметки',
    description: 'Добавляет кнопку «⬇ Скачать» рядом с заголовком видео — сохраняет mp4 в заметки через yt-dlp.',
    target: 'youtube',
    css: `
      .__chinazes-dl-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 0 14px; height: 36px;
        background: rgba(255,255,255,0.1); color: #fff;
        border: none; border-radius: 18px; cursor: pointer;
        font: 500 14px/1 "YouTube Sans", system-ui, sans-serif;
        margin-left: 6px;
      }
      .__chinazes-dl-btn:hover { background: rgba(255,255,255,0.2); }
      .__chinazes-dl-btn[disabled] { opacity: 0.5; cursor: progress; }
    `,
    js: `
      (function () {
        if (window.__chinazesDlInstalled) return;
        window.__chinazesDlInstalled = true;

        function inject() {
          if (!/\\/watch\\?/.test(location.pathname + location.search)) return;
          if (document.querySelector('.__chinazes-dl-btn')) return;
          const actions = document.querySelector('#actions #top-level-buttons-computed, ytd-watch-metadata #actions #top-level-buttons-computed');
          if (!actions) return;
          const btn = document.createElement('button');
          btn.className = '__chinazes-dl-btn';
          btn.innerHTML = '⬇ <span>В заметки</span>';
          btn.onclick = (ev) => {
            ev.preventDefault();
            try {
              btn.disabled = true;
              btn.querySelector('span').textContent = 'Скачиваю...';
              if (window.chinazesGuest && window.chinazesGuest.downloadVideo) {
                window.chinazesGuest.downloadVideo(location.href);
                setTimeout(() => {
                  btn.disabled = false;
                  btn.querySelector('span').textContent = 'В заметки';
                }, 3000);
              } else {
                btn.querySelector('span').textContent = '⚠ Bridge не доступен';
              }
            } catch (e) {
              btn.querySelector('span').textContent = '⚠ ' + e.message;
            }
          };
          actions.appendChild(btn);
        }

        const obs = new MutationObserver(inject);
        obs.observe(document.documentElement, { subtree: true, childList: true });
        inject();
        // Re-inject on YouTube SPA navigation.
        document.addEventListener('yt-navigate-finish', inject);
      })();
    `,
  },
  {
    id: 'global-translator',
    name: 'Глобально · переводчик',
    description: 'Выдели текст на любом сайте → нажми кнопку «Перевести». Использует Google Translate без ключа.',
    target: '*',
    css: `
      .__chinazes-tr-btn {
        position: absolute; z-index: 999998;
        background: linear-gradient(135deg, #4285F4 0%, #5d8ff5 100%);
        color: #fff; font: 600 12px/1 system-ui, sans-serif;
        padding: 6px 10px; border: none; border-radius: 8px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.4); cursor: pointer;
        display: flex; align-items: center; gap: 6px;
      }
      .__chinazes-tr-btn:hover { transform: translateY(-1px); }
      .__chinazes-tr-popup {
        position: absolute; z-index: 999999;
        max-width: 360px;
        background: #1a1a26; color: #e6e8ff;
        border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        padding: 12px 14px; font: 13px/1.45 system-ui, sans-serif;
      }
      .__chinazes-tr-popup__lang { font-size: 10px; color: #7e8efb; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
      .__chinazes-tr-popup__text { white-space: pre-wrap; }
      .__chinazes-tr-popup__close { float: right; cursor: pointer; opacity: 0.6; font-size: 16px; line-height: 1; margin-left: 8px; }
      .__chinazes-tr-popup__close:hover { opacity: 1; }
    `,
    js: `
      (function () {
        if (window.__chinazesTrInstalled) return;
        window.__chinazesTrInstalled = true;

        const TARGET_LANG = (navigator.language || 'ru').split('-')[0] || 'ru';
        let btn = null, popup = null;

        function clear() {
          if (btn) { btn.remove(); btn = null; }
          if (popup) { popup.remove(); popup = null; }
        }

        async function translate(text) {
          const u = 'https://translate.googleapis.com/translate_a/single'
            + '?client=gtx&sl=auto&tl=' + encodeURIComponent(TARGET_LANG)
            + '&dt=t&q=' + encodeURIComponent(text);
          const res = await fetch(u);
          const data = await res.json();
          // data[0] = array of [translated, original, ...] segments
          // data[2] = detected source language
          const out = (data[0] || []).map((s) => s[0]).join('');
          return { text: out, src: data[2] || 'auto' };
        }

        document.addEventListener('mouseup', () => {
          setTimeout(() => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            if (!text || text.length < 2) { clear(); return; }
            if (popup) return; // don't replace open popup
            if (btn) btn.remove();
            const range = sel.getRangeAt(0).getBoundingClientRect();
            btn = document.createElement('button');
            btn.className = '__chinazes-tr-btn';
            btn.textContent = '🌐 Перевести';
            btn.style.left = (window.scrollX + range.right + 6) + 'px';
            btn.style.top = (window.scrollY + range.top - 4) + 'px';
            btn.onclick = async (ev) => {
              ev.stopPropagation();
              btn.textContent = '⏳ ...';
              try {
                const r = await translate(text);
                if (btn) btn.remove();
                btn = null;
                popup = document.createElement('div');
                popup.className = '__chinazes-tr-popup';
                popup.style.left = (window.scrollX + range.left) + 'px';
                popup.style.top = (window.scrollY + range.bottom + 8) + 'px';
                popup.innerHTML = '<span class="__chinazes-tr-popup__close">×</span>'
                  + '<div class="__chinazes-tr-popup__lang">' + r.src + ' → ' + TARGET_LANG + '</div>'
                  + '<div class="__chinazes-tr-popup__text"></div>';
                popup.querySelector('.__chinazes-tr-popup__text').textContent = r.text;
                popup.querySelector('.__chinazes-tr-popup__close').onclick = clear;
                document.body.appendChild(popup);
              } catch (e) {
                console.error('translate failed', e);
                if (btn) btn.textContent = '⚠ ошибка';
              }
            };
            document.body.appendChild(btn);
          }, 0);
        });

        document.addEventListener('mousedown', (e) => {
          if (e.target.closest && (e.target.closest('.__chinazes-tr-btn') || e.target.closest('.__chinazes-tr-popup'))) return;
          clear();
        }, true);
      })();
    `,
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
