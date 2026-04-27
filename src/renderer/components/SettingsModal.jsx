import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldIcon, BrandIcon } from './Icons.jsx';
import { loadPlugins, setEnabled as setPluginEnabled, addCustomPlugin, removePlugin, updateCustomPlugin } from '../plugins.js';
import { THEMES, getStoredTheme, setStoredTheme } from '../themes.js';
import { loadUIPrefs, saveUIPrefs, SIDEBAR_SIZES } from '../ui-prefs.js';
import { UA_PRESETS, getStoredUA, setStoredUA } from '../user-agents.js';
import { FREE_POOLS } from '../free-pools.js';
import { detectCountry } from '../country-flags.js';

const FREE_POOL_URLS = new Set(FREE_POOLS.map((p) => p.url));
const SAFETY_ACK_KEY = 'chinazes:free-pool-safety-ack';

const ENGINES = [
  { id: 'zapret', name: '⚡ Zapret 2 (Recommended)', desc: 'Системный обход DPI на уровне пакетов через WinDivert. Требует установленный Zapret 2 (https://github.com/youtubediscord/zapret). Работает не только в Chinazes, но и во всём ПК.' },
  { id: 'xray',   name: 'Xray / v2ray',              desc: 'VLESS/VMess/Trojan/SS/Hysteria2 + подписки. Включи фильтр «Только CDN (WS+TLS)» — TCP 443 TLS, лучше работает в РФ.' },
];

export default function SettingsModal({
  open,
  onClose,
  proxyState,
  allServices = [],
  hiddenIds = new Set(),
  onToggleHidden = () => {},
  onAddCustom = () => {},
  onRemoveCustom = () => {},
}) {
  const [tab, setTab] = useState('connection'); // 'connection' | 'appearance' | 'services' | 'plugins' | 'ai'
  const [audioBump, setAudioBump] = useState(0); // bump on bg-audio toggle to re-render rows

  // AI config state
  const [aiProviders, setAiProviders] = useState({});
  const [aiCfg, setAiCfg] = useState({ provider: 'groq', apiKey: '', model: '' });
  const [aiKeysPerProvider, setAiKeysPerProvider] = useState({}); // separate keys per provider
  const [aiTestStatus, setAiTestStatus] = useState(''); // '' | 'busy' | 'ok' | 'err'
  const [aiTestMsg, setAiTestMsg] = useState('');
  const [localStatus, setLocalStatus] = useState({ state: 'idle', models: [], error: '' });
  const refreshLocalModels = async () => {
    if (!aiProviders[aiCfg.provider]?.local) return;
    setLocalStatus({ state: 'busy', models: [], error: '' });
    try {
      const res = await window.chinazes?.ai?.listLocalModels?.(aiCfg.provider);
      if (res?.ok) setLocalStatus({ state: 'ok', models: res.models || [], error: '' });
      else setLocalStatus({ state: 'err', models: [], error: res?.error || 'нет ответа' });
    } catch (e) {
      setLocalStatus({ state: 'err', models: [], error: e?.message || String(e) });
    }
  };
  // Auto-probe when switching to a local provider.
  useEffect(() => {
    if (!open) return;
    if (aiProviders[aiCfg.provider]?.local) refreshLocalModels();
    else setLocalStatus({ state: 'idle', models: [], error: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aiCfg.provider, aiProviders]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const provs = await window.chinazes.ai.providers();
        setAiProviders(provs);
        const full = await window.chinazes.ai.getFull();
        // Load provider-specific keys from localStorage
        const savedKeys = JSON.parse(localStorage.getItem('chinazes:ai-keys-per-provider') || '{}');
        setAiKeysPerProvider(savedKeys);
        setAiCfg({
          provider: full.provider || 'groq',
          apiKey: savedKeys[full.provider || 'groq'] || full.apiKey || '',
          model: full.model || ''
        });
      } catch (e) { console.error(e); }
    })();
  }, [open]);
  async function persistAi(patch) {
    const next = { ...aiCfg, ...patch };
    setAiCfg(next);
    // Save key for current provider separately
    if (patch.apiKey !== undefined) {
      const updatedKeys = { ...aiKeysPerProvider, [next.provider]: patch.apiKey };
      setAiKeysPerProvider(updatedKeys);
      localStorage.setItem('chinazes:ai-keys-per-provider', JSON.stringify(updatedKeys));
    }
    await window.chinazes.ai.setConfig({ provider: next.provider, apiKey: next.apiKey, model: next.model });
  }
  function switchProvider(id) {
    const info = aiProviders[id];
    const savedKey = aiKeysPerProvider[id] || '';
    setAiCfg({ provider: id, apiKey: savedKey, model: info?.defaultModel || '' });
    persistAi({ provider: id, apiKey: savedKey, model: info?.defaultModel || '' });
  }
  async function testAi() {
    setAiTestStatus('busy'); setAiTestMsg('');
    try {
      const r = await window.chinazes.ai.chat({
        messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
      });
      setAiTestStatus('ok');
      setAiTestMsg(`✓ ${r.reply.slice(0, 80)}`);
    } catch (e) {
      setAiTestStatus('err');
      setAiTestMsg(e.message || String(e));
    }
  }
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcUrl, setNewSvcUrl] = useState('');
  const [svcError, setSvcError] = useState('');

  // Plugins state
  const [plugins, setPlugins] = useState(loadPlugins);
  const [showAddPlugin, setShowAddPlugin] = useState(false);
  const [pluginDraft, setPluginDraft] = useState({ name: '', description: '', target: '*', css: '', js: '' });
  const [aiGenPrompt, setAiGenPrompt] = useState('');
  const [aiGenBusy, setAiGenBusy] = useState(false);
  const [aiGenError, setAiGenError] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  async function importFromUrl() {
    if (!importUrl.trim() || importBusy) return;
    setImportBusy(true); setImportError('');
    try {
      const res = await fetch(importUrl.trim());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const items = Array.isArray(j) ? j : [j];
      let added = 0;
      for (const p of items) {
        if (!p || (typeof p !== 'object')) continue;
        addCustomPlugin({
          name: p.name || 'Imported',
          description: p.description || '',
          target: p.target || '*',
          css: p.css || '',
          js: p.js || '',
        });
        added++;
      }
      if (added === 0) throw new Error('JSON не содержит плагинов');
      setImportUrl('');
      refreshPlugins();
    } catch (e) {
      setImportError('Ошибка импорта: ' + (e?.message || e));
    } finally {
      setImportBusy(false);
    }
  }
  async function generatePlugin() {
    if (!aiGenPrompt.trim() || aiGenBusy) return;
    setAiGenBusy(true); setAiGenError('');
    try {
      const r = await window.chinazes.ai.chat({
        messages: [
          {
            role: 'system',
            content: 'Ты генератор плагинов для Chinazes. Плагин = JSON-объект с полями: name (короткое имя), description (1 предложение), target ("*" или id сервиса: telegram, discord, youtube, twitch, vk, instagram, x, spotify, yamusic, gmail, google, steam, tiktok), css (строка CSS, может быть пустая), js (строка JS — IIFE, может быть пустая, выполняется в контексте сайта). ВЕРНИ ТОЛЬКО ВАЛИДНЫЙ JSON БЕЗ MARKDOWN-обёрток. Никаких ```json. Только {...}.',
          },
          { role: 'user', content: aiGenPrompt.trim() },
        ],
      });
      let text = (r.reply || '').trim();
      // Strip ```json fences if AI ignored instructions.
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(text);
      setPluginDraft({
        name: parsed.name || 'AI plugin',
        description: parsed.description || '',
        target: parsed.target || '*',
        css: parsed.css || '',
        js: parsed.js || '',
      });
      setShowAddPlugin(true);
      setAiGenPrompt('');
    } catch (e) {
      setAiGenError('Не получилось распарсить ответ AI: ' + (e?.message || e));
    } finally {
      setAiGenBusy(false);
    }
  }
  function refreshPlugins() { setPlugins(loadPlugins()); }
  function togglePlugin(id, enabled) { setPluginEnabled(id, enabled); refreshPlugins(); }
  function deletePlugin(id) { removePlugin(id); refreshPlugins(); }
  function submitPlugin() {
    if (!pluginDraft.name.trim() && !pluginDraft.css.trim() && !pluginDraft.js.trim()) return;
    addCustomPlugin(pluginDraft);
    setPluginDraft({ name: '', description: '', target: '*', css: '', js: '' });
    setShowAddPlugin(false);
    refreshPlugins();
  }
  const [engine, setEngine] = useState('zapret');
  const [config, setConfig] = useState(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme());
  const [uiPrefs, setUiPrefs] = useState(loadUIPrefs);
  const updateUI = (patch) => {
    setUiPrefs((cur) => {
      const next = {
        ...cur,
        ...patch,
        features: { ...cur.features, ...(patch.features || {}) },
      };
      saveUIPrefs(next);
      return next;
    });
  };
  const [uaId, setUaId] = useState(getStoredUA());
  const [latencies, setLatencies] = useState([]);   // ms or null per server
  const [probing, setProbing] = useState(false);
  const [hideUnreachable, setHideUnreachable] = useState(true);
  const [cdnOnly, setCdnOnly] = useState(false);
  const [countryFilter, setCountryFilter] = useState('all');
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [pendingPoolUrl, setPendingPoolUrl] = useState('');

  function tryAddCustom() {
    const raw = newSvcUrl.trim();
    if (!raw) return;
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const u = new URL(url);
      onAddCustom({ name: newSvcName.trim() || u.hostname, url });
      setNewSvcUrl('');
      setNewSvcName('');
      setSvcError('');
    } catch {
      setSvcError('Неверный URL. Пример: https://example.com');
    }
  }

  async function onPickUA(id) {
    setUaId(id);
    setStoredUA(id);
    const preset = UA_PRESETS.find((p) => p.id === id) || UA_PRESETS[0];
    try { await window.chinazes.app.setUserAgent(preset.ua || ''); } catch {}
  }

  useEffect(() => {
    if (!open) return;
    reload();
  }, [open]);

  async function reload() {
    const cfg = await window.chinazes.proxy.getConfig();
    setConfig(cfg);
    setEngine(cfg.engine || 'zapret');
    setLink(cfg.xray?.subscription || cfg.xray?.link || '');
    setError('');
  }

  async function probeAll(indices = null) {
    setProbing(true);
    try {
      const lat = await window.chinazes.proxy.probeServers({ indices });
      // If we probed a subset, merge with previous so other countries keep their measurements.
      setLatencies((prev) => {
        if (!indices) return lat || [];
        const next = (prev && prev.length === lat.length) ? [...prev] : new Array(lat.length).fill(null);
        for (const i of indices) next[i] = lat[i];
        return next;
      });
    } catch { /* ignore */ }
    finally { setProbing(false); }
  }

  async function probeCountry(code) {
    setCountryFilter(code);
    if (code === 'all') return;
    const indices = [];
    for (let i = 0; i < servers.length; i++) {
      const c = detectCountry(servers[i].meta.name || '', servers[i].meta.address || '');
      if ((c.code || 'XX') === code) indices.push(i);
    }
    if (indices.length) await probeAll(indices);
  }

  function maybeShowSafetyWarning(url) {
    if (!FREE_POOL_URLS.has(url)) return false;
    if (localStorage.getItem(SAFETY_ACK_KEY) === '1') return false;
    setPendingPoolUrl(url);
    setShowSafetyModal(true);
    return true;
  }

  async function onImport() {
    const trimmed = link.trim();
    if (maybeShowSafetyWarning(trimmed)) return;       // first wait for ack
    setBusy(true); setError('');
    try {
      await window.chinazes.proxy.importLink(trimmed);
      await reload();
      setLatencies([]);                                 // reset; user clicks a country to probe
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  async function onRefresh() {
    setBusy(true); setError('');
    try {
      await window.chinazes.proxy.refreshSubscription();
      await reload();
      setLatencies([]);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  function onPickFreePool(url) {
    setLink(url);
    if (maybeShowSafetyWarning(url)) return;
    (async () => {
      setBusy(true); setError('');
      try {
        await window.chinazes.proxy.importLink(url);
        await reload();
        setLatencies([]);
      } catch (e) { setError(e?.message || String(e)); }
      finally { setBusy(false); }
    })();
  }

  async function onSafetyAccept() {
    localStorage.setItem(SAFETY_ACK_KEY, '1');
    setShowSafetyModal(false);
    const url = pendingPoolUrl;
    setPendingPoolUrl('');
    setBusy(true); setError('');
    try {
      await window.chinazes.proxy.importLink(url);
      await reload();
      setLatencies([]);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  async function onSelectServer(i) {
    setBusy(true); setError('');
    try {
      await window.chinazes.proxy.selectServer(i);
      await reload();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  async function onSwitchEngine(newEngine) {
    setBusy(true); setError('');
    try {
      await window.chinazes.proxy.setEngine(newEngine);
      setEngine(newEngine);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  async function onConnect() {
    setBusy(true); setError('');
    try { await window.chinazes.proxy.connect(); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  async function onDisconnect() {
    setBusy(true);
    try { await window.chinazes.proxy.disconnect(); }
    finally { setBusy(false); }
  }

  const connected = proxyState?.status === 'connected';
  const servers = config?.xray?.servers || [];
  const selectedIdx = config?.xray?.selectedIndex ?? 0;

  return (
    <AnimatePresence>
      {showSafetyModal && (
        <motion.div
          className="modal-backdrop"
          style={{ zIndex: 100 }}
          onClick={() => setShowSafetyModal(false)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal modal--safety"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <header className="modal__header">
              <div className="modal__title">
                <span className="safety__icon">⚠</span>
                Внимание: бесплатные сервера
              </div>
            </header>
            <div className="modal__body">
              <p className="safety__lead">
                Бесплатные публичные VPN/прокси <b>могут видеть и записывать твой трафик</b>.
                Владельцы серверов часто:
              </p>
              <ul className="safety__list">
                <li>Логируют все HTTP-запросы и куки</li>
                <li>Подменяют контент незашифрованных страниц (HTTP)</li>
                <li>Перехватывают логины через MITM (если сертификат сайта подделан)</li>
                <li>Продают историю посещений рекламодателям</li>
              </ul>
              <p className="safety__lead"><b>Что НЕ ДЕЛАТЬ через бесплатный прокси:</b></p>
              <ul className="safety__list safety__list--bad">
                <li>Не входить в банк-клиенты, госуслуги, почту с важными данными</li>
                <li>Не вводить пароли там, где их раньше не вводил через этот пул</li>
                <li>Не платить картой</li>
              </ul>
              <p className="safety__lead"><b>Что МОЖНО:</b></p>
              <ul className="safety__list safety__list--ok">
                <li>YouTube, Discord, новости — обычный обход блокировок</li>
                <li>Соцсети, где у тебя нет ничего критичного</li>
                <li>Telegram через WebApp (он сквозно зашифрован)</li>
              </ul>
              <p className="modal__hint muted">
                Chinazes использует <b>HTTPS-only</b> подключения по возможности и
                не сохраняет сессии после закрытия. Но окончательная безопасность —
                на твоей стороне.
              </p>
            </div>
            <footer className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setShowSafetyModal(false)}>
                Отмена
              </button>
              <button className="btn btn--primary" onClick={onSafetyAccept}>
                Понимаю риски — продолжить
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
      {open && (
        <motion.div
          className="modal-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <header className="modal__header">
              <div className="modal__title">
                <ShieldIcon />
                <span>Settings</span>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </header>

            <div className="modal__seg">
              <button
                className={`modal__seg-btn ${tab === 'connection' ? 'modal__seg-btn--active' : ''}`}
                onClick={() => setTab('connection')}
              >Connection</button>
              <button
                className={`modal__seg-btn ${tab === 'services' ? 'modal__seg-btn--active' : ''}`}
                onClick={() => setTab('services')}
              >Services</button>
              <button
                className={`modal__seg-btn ${tab === 'plugins' ? 'modal__seg-btn--active' : ''}`}
                onClick={() => setTab('plugins')}
              >Plugins <span className="beta-tag">beta</span></button>
              <button
                className={`modal__seg-btn ${tab === 'ai' ? 'modal__seg-btn--active' : ''}`}
                onClick={() => setTab('ai')}
              >AI</button>
              <button
                className={`modal__seg-btn ${tab === 'appearance' ? 'modal__seg-btn--active' : ''}`}
                onClick={() => setTab('appearance')}
              >Appearance</button>
            </div>

            {tab === 'ai' && (
              <section className="modal__body">
                <p className="modal__hint">
                  Подключи AI-провайдера для встроенной функции «Спросить AI» (выдели текст
                  на любом сайте — получи объяснение, перевод, суммаризацию). Ключ хранится
                  локально в <code>userData/ai-config.json</code>.
                </p>

                <h4 className="modal__subtitle">Провайдер</h4>
                <div className="ai-providers">
                  {Object.entries(aiProviders).map(([id, info]) => (
                    <button
                      key={id}
                      className={`ai-provider ${aiCfg.provider === id ? 'ai-provider--active' : ''}`}
                      onClick={() => switchProvider(id)}
                      title={info.desc || ''}
                    >
                      <div className="ai-provider__name">{info.label}</div>
                      <div className="ai-provider__model">{info.defaultModel}</div>
                      {info.vision && <span className="ai-provider__badge" title="Vision: может анализировать изображения">👁 Vision</span>}
                      {info.desc && <div className="ai-provider__desc">{info.desc}</div>}
                    </button>
                  ))}
                </div>

                {!aiProviders[aiCfg.provider]?.local && (
                  <>
                    <h4 className="modal__subtitle">API key</h4>
                    <input
                      type="password"
                      className="input input--dark"
                      placeholder={`API key для ${aiProviders[aiCfg.provider]?.label || aiCfg.provider}`}
                      value={aiCfg.apiKey}
                      onChange={(e) => setAiCfg({ ...aiCfg, apiKey: e.target.value })}
                      onBlur={() => persistAi({ apiKey: aiCfg.apiKey })}
                    />
                    {aiProviders[aiCfg.provider]?.apiKeyUrl && (
                      <p className="modal__hint muted">
                        Получить ключ:&nbsp;
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            try { window.open(aiProviders[aiCfg.provider].apiKeyUrl, '_blank'); } catch {}
                          }}
                        >{aiProviders[aiCfg.provider].apiKeyUrl}</a>
                      </p>
                    )}
                  </>
                )}

                {aiProviders[aiCfg.provider]?.local && (
                  <div className="ai-local-status">
                    <span className={`ai-local-status__dot ai-local-status__dot--${localStatus.state}`} />
                    <span className="ai-local-status__text">
                      {localStatus.state === 'ok' && `Сервер запущен · ${localStatus.models?.length || 0} моделей`}
                      {localStatus.state === 'busy' && 'Проверяю сервер…'}
                      {localStatus.state === 'err' && `Сервер недоступен: ${localStatus.error || 'нет ответа'}`}
                      {localStatus.state === 'idle' && `Адрес: ${aiProviders[aiCfg.provider]?.baseUrl}`}
                    </span>
                    <button className="btn btn--ghost btn--small" onClick={refreshLocalModels} disabled={localStatus.state === 'busy'}>
                      ↻ Обновить
                    </button>
                  </div>
                )}

                <h4 className="modal__subtitle">Модель</h4>
                <select
                  className="input"
                  value={aiCfg.model || aiProviders[aiCfg.provider]?.defaultModel || ''}
                  onChange={(e) => persistAi({ model: e.target.value })}
                >
                  {(() => {
                    const builtIn = aiProviders[aiCfg.provider]?.models || [];
                    const live = aiProviders[aiCfg.provider]?.local && localStatus.state === 'ok'
                      ? localStatus.models : [];
                    const seen = new Set();
                    const merged = [...live, ...builtIn].filter((m) => {
                      if (!m || seen.has(m)) return false;
                      seen.add(m); return true;
                    });
                    return merged.map((m) => <option key={m} value={m}>{m}</option>);
                  })()}
                </select>

                <div className="ai-test-row">
                  <button
                    className="btn btn--primary"
                    onClick={testAi}
                    disabled={aiTestStatus === 'busy' || (!aiCfg.apiKey && !aiProviders[aiCfg.provider]?.local)}
                  >
                    {aiTestStatus === 'busy' ? 'Тестирую...' : 'Проверить ключ'}
                  </button>
                  {aiTestMsg && (
                    <span className={`ai-test-msg ai-test-msg--${aiTestStatus}`}>{aiTestMsg}</span>
                  )}
                </div>
              </section>
            )}

            {tab === 'plugins' && (
              <section className="modal__body">
                <div className="beta-banner">
                  <span className="beta-banner__tag">BETA</span>
                  <span>Часть плагинов сейчас не работает корректно — чиним. Включай на свой страх и риск.</span>
                </div>
                <p className="modal__hint">
                  Плагины инжектят CSS / JS внутрь webview конкретного сервиса. Включай
                  готовые из стора или пиши свои. JS выполняется в контексте сайта, будь
                  осторожен с тем, что включаешь из чужих источников.
                </p>

                <div className="svc-list">
                  {plugins.map((p) => {
                    const targetSvc = allServices.find((s) => s.id === p.target);
                    return (
                      <div key={p.id} className="svc-row plugin-row">
                        <div className="svc-row__icon" style={{ '--accent': targetSvc?.accent || '#7e8efb' }}>
                          {p.target === '*'
                            ? <span className="plugin-target-glob">★</span>
                            : (targetSvc?.iconUrl
                                ? <img src={targetSvc.iconUrl} alt="" />
                                : <BrandIcon id={targetSvc?.icon || p.target} />)}
                        </div>
                        <div className="svc-row__meta">
                          <div className="svc-row__name">
                            {p.name}
                            <span className="plugin-badge">
                              {p.builtin ? 'built-in' : 'custom'}
                            </span>
                            <span className="plugin-target">{p.target === '*' ? 'все сервисы' : (targetSvc?.name || p.target)}</span>
                          </div>
                          <div className="svc-row__url">{p.description || '—'}</div>
                        </div>
                        <label className="switch" title={p.enabled ? 'Отключить' : 'Включить'}>
                          <input
                            type="checkbox"
                            checked={!!p.enabled}
                            onChange={(e) => togglePlugin(p.id, e.target.checked)}
                          />
                          <span className="switch__slider" />
                        </label>
                        {!p.builtin && (
                          <button className="btn btn--ghost btn--small" onClick={() => deletePlugin(p.id)} title="Удалить">×</button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!showAddPlugin && (
                  <>
                    <h4 className="modal__subtitle">📥 Импорт по URL</h4>
                    <div className="plugin-form__row">
                      <input
                        className="input"
                        placeholder="https://example.com/plugins.json"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') importFromUrl(); }}
                        disabled={importBusy}
                      />
                      <button
                        className="btn btn--primary"
                        onClick={importFromUrl}
                        disabled={importBusy || !importUrl.trim()}
                      >{importBusy ? '...' : '↓'}</button>
                    </div>
                    {importError && <p className="modal__hint" style={{ color: '#ff7a7a' }}>{importError}</p>}

                    <h4 className="modal__subtitle">🪄 Сгенерировать через AI</h4>
                    <div className="plugin-form__row">
                      <input
                        className="input"
                        placeholder='Опиши плагин: "тёмная тема для Spotify", "скрыть рекламу на YouTube" и т.д.'
                        value={aiGenPrompt}
                        onChange={(e) => setAiGenPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') generatePlugin(); }}
                        disabled={aiGenBusy}
                      />
                      <button
                        className="btn btn--primary"
                        onClick={generatePlugin}
                        disabled={aiGenBusy || !aiGenPrompt.trim()}
                      >{aiGenBusy ? '...' : '✨'}</button>
                    </div>
                    {aiGenError && <p className="modal__hint" style={{ color: '#ff7a7a' }}>{aiGenError}</p>}
                    <div style={{ marginTop: 8 }}>
                      <button className="btn btn--ghost" onClick={() => setShowAddPlugin(true)}>
                        + Добавить вручную
                      </button>
                    </div>
                  </>
                )}

                {showAddPlugin && (
                  <div className="plugin-form">
                    <h4 className="modal__subtitle">Новый плагин</h4>
                    <div className="plugin-form__row">
                      <input
                        className="input"
                        placeholder="Название"
                        value={pluginDraft.name}
                        onChange={(e) => setPluginDraft({ ...pluginDraft, name: e.target.value })}
                      />
                      <select
                        className="input"
                        value={pluginDraft.target}
                        onChange={(e) => setPluginDraft({ ...pluginDraft, target: e.target.value })}
                      >
                        <option value="*">★ все сервисы</option>
                        {allServices.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      className="input"
                      placeholder="Описание (необязательно)"
                      value={pluginDraft.description}
                      onChange={(e) => setPluginDraft({ ...pluginDraft, description: e.target.value })}
                    />
                    <textarea
                      className="input plugin-form__code"
                      placeholder="/* CSS */"
                      rows={4}
                      value={pluginDraft.css}
                      onChange={(e) => setPluginDraft({ ...pluginDraft, css: e.target.value })}
                    />
                    <textarea
                      className="input plugin-form__code"
                      placeholder="// JavaScript"
                      rows={4}
                      value={pluginDraft.js}
                      onChange={(e) => setPluginDraft({ ...pluginDraft, js: e.target.value })}
                    />
                    <div className="plugin-form__row">
                      <button className="btn btn--ghost" onClick={() => setShowAddPlugin(false)}>Отмена</button>
                      <button className="btn btn--primary" onClick={submitPlugin}>Сохранить</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {tab === 'services' && (
              <section className="modal__body">
                <p className="modal__hint">
                  Включи/выключи иконки в боковой панели или добавь свой сайт. Можно
                  перетаскивать иконки в сайдбаре, чтобы менять порядок.
                </p>

                <div className="svc-list">
                  {allServices.map((svc) => {
                    const enabled = !hiddenIds.has(svc.id);
                    const keepAudioKey = `chinazes:keep-audio-bg:${svc.id}`;
                    const keepAudio = (() => {
                      try {
                        const v = localStorage.getItem(keepAudioKey);
                        if (v === '1') return true;
                        if (v === '0') return false;
                      } catch {}
                      // Custom services default to true (assume media), built-ins follow hardcoded list
                      const KEEP_AUDIO_BG_DEFAULTS = new Set(['discord', 'telegram', 'twitch', 'spotify', 'yamusic', 'vk', 'youtube']);
                      return svc.custom ? true : KEEP_AUDIO_BG_DEFAULTS.has(svc.id);
                    })();
                    const setKeepAudio = (val) => {
                      try {
                        localStorage.setItem(keepAudioKey, val ? '1' : '0');
                        window.dispatchEvent(new CustomEvent('chinazes-prefs-changed'));
                        setAudioBump((n) => n + 1);
                      } catch {}
                    };
                    return (
                      <div key={svc.id} className="svc-row">
                        <div className="svc-row__icon" style={{ '--accent': svc.accent }}>
                          {svc.iconUrl
                            ? <img src={svc.iconUrl} alt="" draggable={false} />
                            : <BrandIcon id={svc.icon} />}
                        </div>
                        <div className="svc-row__meta">
                          <div className="svc-row__name">{svc.name}{svc.custom ? ' · custom' : ''}</div>
                          <div className="svc-row__url">{svc.url}</div>
                          <div className="svc-row__audio">
                            <span className="svc-row__audio-label">🔊 Фоновый звук</span>
                            <label className="switch switch--small" title="Продолжать играть звук в фоне">
                              <input
                                type="checkbox"
                                checked={keepAudio}
                                onChange={(e) => setKeepAudio(e.target.checked)}
                              />
                              <span className="switch__slider" />
                            </label>
                          </div>
                        </div>
                        <label className="switch" title={enabled ? 'Скрыть' : 'Показать'}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => onToggleHidden(svc.id)}
                          />
                          <span className="switch__slider" />
                        </label>
                        {svc.custom && (
                          <button
                            className="btn btn--ghost btn--small"
                            onClick={() => onRemoveCustom(svc.id)}
                            title="Удалить"
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <h4 className="modal__subtitle">Добавить сайт</h4>
                <div className="svc-add">
                  <input
                    className="input"
                    placeholder="Название (необязательно)"
                    value={newSvcName}
                    onChange={(e) => setNewSvcName(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="https://example.com"
                    value={newSvcUrl}
                    onChange={(e) => setNewSvcUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') tryAddCustom(); }}
                  />
                  <button
                    className="btn btn--primary"
                    onClick={tryAddCustom}
                    disabled={!newSvcUrl.trim()}
                  >Добавить</button>
                </div>
                {svcError && <p className="modal__hint" style={{ color: '#ff7a7a' }}>{svcError}</p>}
                <p className="modal__hint muted">
                  Иконка будет загружена автоматически (favicon сайта). Каждый сайт получает
                  отдельную сессию — логины не пересекаются.
                </p>
              </section>
            )}

            {tab === 'appearance' && (
              <section className="modal__body">
                <p className="modal__hint">Цветовая палитра приложения. Применяется сразу.</p>
                <div className="theme-grid">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      className={`theme-card ${theme === t.id ? 'theme-card--active' : ''}`}
                      onClick={() => { setTheme(t.id); setStoredTheme(t.id); }}
                      style={{ background: t.vars['--bg-2'], color: t.vars['--fg'] }}
                    >
                      <div className="theme-card__swatches">
                        <span style={{ background: t.vars['--bg'] }} />
                        <span style={{ background: t.vars['--bg-2'] }} />
                        <span style={{ background: t.vars['--bg-3'] }} />
                        <span style={{ background: t.vars['--fg'] }} />
                      </div>
                      <div className="theme-card__meta">
                        <span className="theme-card__name">{t.name}</span>
                        <span className="theme-card__desc">{t.desc}</span>
                      </div>
                      {theme === t.id && <span className="theme-card__check">✓</span>}
                    </button>
                  ))}
                </div>

                <div className="settings-section">
                  <h4 className="settings-section__title">Размер иконок sidebar</h4>
                  <p className="modal__hint muted">Применяется сразу. Влияет на ширину боковой панели и величину иконок.</p>
                  <div className="size-grid">
                    {Object.keys(SIDEBAR_SIZES).map((id) => {
                      const s = SIDEBAR_SIZES[id];
                      const label = id === 'small' ? 'Компактный' : id === 'large' ? 'Крупный' : 'Стандартный';
                      const active = uiPrefs.sidebarSize === id;
                      return (
                        <button
                          key={id}
                          className={`size-card ${active ? 'size-card--active' : ''}`}
                          onClick={() => updateUI({ sidebarSize: id })}
                        >
                          <span
                            className="size-card__preview"
                            style={{
                              width: s.tab,
                              height: s.tab,
                              borderRadius: s.radius,
                            }}
                          >
                            <span style={{ width: s.icon, height: s.icon }} />
                          </span>
                          <span className="size-card__name">{label}</span>
                          <span className="size-card__desc">{s.sidebar}px / иконка {s.icon}px</span>
                          {active && <span className="theme-card__check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="settings-section">
                  <h4 className="settings-section__title">Боковые кнопки</h4>
                  <p className="modal__hint muted">Скройте ненужные кнопки в нижней части sidebar и в заголовке.</p>
                  <div className="feature-toggles">
                    {[
                      { id: 'cobrowse', label: 'Co-browsing',   desc: 'Двойная сессия одного сайта' },
                      { id: 'apps',     label: 'Приложения',    desc: 'Игры и web-приложения' },
                      { id: 'ai',       label: 'AI чат',        desc: 'Чат-ассистент в боковой панели' },
                      { id: 'notes',    label: 'Заметки',       desc: 'Локальные заметки' },
                    ].map((f) => (
                      <label key={f.id} className="feature-toggle">
                        <span className="feature-toggle__meta">
                          <span className="feature-toggle__name">{f.label}</span>
                          <span className="feature-toggle__desc">{f.desc}</span>
                        </span>
                        <span className="switch">
                          <input
                            type="checkbox"
                            checked={!!uiPrefs.features[f.id]}
                            onChange={(e) => updateUI({ features: { [f.id]: e.target.checked } })}
                          />
                          <span className="switch__slider" />
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="settings-section">
                  <h4 className="settings-section__title">Браузер (User-Agent)</h4>
                  <p className="modal__hint muted">
                    Меняет User-Agent для всех встроенных сайтов. Движок остаётся Chromium —
                    реально подменить нельзя, но сайты могут отдать другую вёрстку или фичи.
                    Применяется при следующей перезагрузке страницы.
                  </p>
                  <div className="ua-grid">
                    {UA_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        className={`ua-card ${uaId === p.id ? 'ua-card--active' : ''}`}
                        onClick={() => onPickUA(p.id)}
                      >
                        <span className="ua-card__name">{p.name}</span>
                        <span className="ua-card__desc">{p.desc}</span>
                        {uaId === p.id && <span className="theme-card__check">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {tab === 'connection' && (<>
            <div className="engine-tabs">
              {ENGINES.map((e) => (
                <button
                  key={e.id}
                  className={`engine-tab ${engine === e.id ? 'engine-tab--active' : ''}`}
                  onClick={() => onSwitchEngine(e.id)}
                  disabled={busy}
                >
                  <span className="engine-tab__name">{e.name}</span>
                  <span className="engine-tab__desc">{e.desc}</span>
                </button>
              ))}
            </div>

            <section className="modal__body">
              {engine === 'xray' && (
                <>
                  <p className="modal__hint">
                    Вставь <code>vless://</code> / <code>vmess://</code> / <code>trojan://</code> / <code>ss://</code> / <code>hysteria2://</code>,
                    список ссылок, или URL подписки (<code>https://...</code>).
                  </p>

                  <div className="free-pools">
                    <div className="free-pools__title">
                      <span>🌐 Бесплатные пулы серверов</span>
                      <span className="free-pools__warn">⚠ untrusted — читай предупреждение</span>
                    </div>
                    <div className="free-pools__grid">
                      {FREE_POOLS.map((p) => {
                        const isActive = config?.xray?.subscription === p.url;
                        const otherActive = config?.xray?.subscription &&
                                            FREE_POOL_URLS.has(config.xray.subscription) &&
                                            !isActive;
                        return (
                          <button
                            key={p.id}
                            className={`free-pool ${isActive ? 'free-pool--active' : ''} ${otherActive ? 'free-pool--locked' : ''}`}
                            onClick={() => onPickFreePool(p.url)}
                            disabled={busy || otherActive}
                            title={otherActive ? 'Сначала отключись от текущего пула' : p.url}
                          >
                            <span className="free-pool__name">{p.name}</span>
                            <span className="free-pool__desc">{p.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                    {config?.xray?.subscription && FREE_POOL_URLS.has(config.xray.subscription) && (
                      <div className="free-pools__actions">
                        <button
                          className="btn btn--secondary"
                          onClick={async () => {
                            setBusy(true); setError('');
                            try {
                              if (proxyState?.status === 'connected') {
                                await window.chinazes.proxy.disconnect();
                              }
                              await window.chinazes.proxy.clearXray();
                              await reload();
                              setLatencies([]);
                              setLink('');
                            } catch (e) { setError(e?.message || String(e)); }
                            finally { setBusy(false); }
                          }}
                          disabled={busy}
                        >
                          ⏏ Отключить пул и очистить
                        </button>
                      </div>
                    )}
                  </div>

                  <label className="field">
                    <span>Или своя ссылка / подписка</span>
                    <textarea
                      rows={3}
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="vless://... либо https://example.com/subscription"
                      spellCheck={false}
                    />
                  </label>

                  <div className="actions">
                    <button className="btn" onClick={onImport} disabled={busy || !link.trim()}>
                      Import
                    </button>
                    {config?.xray?.subscription && (
                      <button className="btn" onClick={onRefresh} disabled={busy}>
                        Refresh subscription
                      </button>
                    )}
                    {servers.length > 0 && (
                      <button className="btn" onClick={probeAll} disabled={probing}>
                        {probing ? 'Тестирую…' : 'Test all'}
                      </button>
                    )}
                  </div>

                  {servers.length > 0 && (() => {
                    // Build country index for chips: { code, flag, count }
                    const countryMap = new Map();
                    servers.forEach((s, i) => {
                      const c = detectCountry(s.meta.name || '', s.meta.address || '');
                      const key = c.code || 'XX';
                      if (!countryMap.has(key)) countryMap.set(key, { ...c, count: 0, alive: 0 });
                      const entry = countryMap.get(key);
                      entry.count++;
                      if (latencies[i] != null) entry.alive++;
                    });
                    const countryChips = [...countryMap.values()].sort((a, b) => b.count - a.count);
                    return (
                    <div className="server-list">
                      {countryChips.length > 1 && (
                        <div className="country-chips">
                          <button
                            className={`country-chip ${countryFilter === 'all' ? 'country-chip--active' : ''}`}
                            onClick={() => setCountryFilter('all')}
                            disabled={probing}
                          >
                            <span>🌍</span> Все ({servers.length})
                          </button>
                          {countryChips.map((c) => (
                            <button
                              key={c.code || 'XX'}
                              className={`country-chip ${countryFilter === (c.code || 'XX') ? 'country-chip--active' : ''}`}
                              onClick={() => probeCountry(c.code || 'XX')}
                              title={`${c.country} — клик чтобы протестировать ${c.count} серверов`}
                              disabled={probing}
                            >
                              <span>{c.flag}</span>
                              {c.code || '??'}
                              <span className="country-chip__count">{c.count}</span>
                            </button>
                          ))}
                          {probing && <span className="country-chip__probing">Тестирую…</span>}
                        </div>
                      )}
                      <div className="server-list__title">
                        <span>Servers ({servers.length})</span>
                        {config?.xray?.subscription && (
                          <span className="muted"> · {new URL(config.xray.subscription).host}</span>
                        )}
                        <label className="server-list__filter" title="Оставить только VLESS/VMess через WebSocket+TLS — обычно через Cloudflare CDN, лучше работают в РФ">
                          <input
                            type="checkbox"
                            checked={cdnOnly}
                            onChange={(e) => setCdnOnly(e.target.checked)}
                          />
                          Только CDN (WS+TLS)
                        </label>
                        {latencies.length > 0 && (
                          <label className="server-list__filter">
                            <input
                              type="checkbox"
                              checked={hideUnreachable}
                              onChange={(e) => setHideUnreachable(e.target.checked)}
                            />
                            Только рабочие
                          </label>
                        )}
                      </div>
                      <div className="server-list__items">
                        {servers
                          .map((s, i) => ({ s, i, lat: latencies[i], country: detectCountry(s.meta.name || '', s.meta.address || '') }))
                          .filter(({ country }) => countryFilter === 'all' || (country.code || 'XX') === countryFilter)
                          .filter(({ s }) => !cdnOnly || (s.meta.network === 'ws' && s.meta.security === 'tls'))
                          .filter(({ lat }) => !(hideUnreachable && latencies.length > 0 && lat == null))
                          .sort((a, b) => {
                            if (a.lat == null && b.lat == null) return 0;
                            if (a.lat == null) return 1;
                            if (b.lat == null) return -1;
                            return a.lat - b.lat;
                          })
                          .map(({ s, i, lat }) => {
                            const country = detectCountry(s.meta.name || '', s.meta.address || '');
                            return (
                              <button
                                key={i}
                                className={`server-row ${i === selectedIdx ? 'server-row--active' : ''}`}
                                onClick={() => onSelectServer(i)}
                                disabled={busy}
                              >
                                <span className="server-row__flag" title={country.country}>{country.flag}</span>
                                <span className="server-row__proto">{s.meta.protocol}</span>
                                <span className="server-row__name">{s.meta.name || '(unnamed)'}</span>
                                <span className="server-row__addr muted">
                                  {s.meta.address}:{s.meta.port}
                                </span>
                                {latencies.length > 0 && (
                                  <span className={`server-row__latency ${
                                    lat == null ? 'lat--bad' :
                                    lat < 200 ? 'lat--good' :
                                    lat < 500 ? 'lat--ok' : 'lat--slow'
                                  }`}>
                                    {lat == null ? '✗' : `${lat}ms`}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                    );
                  })()}
                </>
              )}

              {engine === 'zapret' && (
                <div className="engine-panel">
                  <p className="modal__hint">
                    <b>⚡ Zapret 2 — системный обход DPI на уровне пакетов.</b> В отличие от
                    SOCKS-прокси, Zapret модифицирует TCP/UDP-пакеты через драйвер WinDivert,
                    поэтому работает <b>сразу для всего ПК</b> — Chinazes, браузер, Discord, игры.
                    Не требует серверов, аккаунтов и подписок.
                  </p>
                  <ol className="steps">
                    <li>Скачай установщик: <a href="https://github.com/youtubediscord/zapret/releases/latest" target="_blank" rel="noreferrer">github.com/youtubediscord/zapret</a> (<code>ZapretSetup.exe</code>).</li>
                    <li>Установи и запусти приложение <b>Zapret 2</b>. В нём выбери стратегию (например «Alt 2» или «bol-van v3») и нажми <b>Запустить</b>.</li>
                    <li>В Chinazes нажми <b>Connect</b> — мы автоматически определим запущенный Zapret и подключимся к нему.</li>
                  </ol>
                  <p className="modal__hint muted">
                    Если Zapret 2 уже работает на ПК, Chinazes не запускает второй экземпляр
                    (две инстанции WinDivert конфликтуют). Управляй стратегиями и логами через
                    стандартный GUI Zapret 2.
                  </p>
                </div>
              )}

              <details className="zapret-howto">
                <summary>
                  <span>🛡️ Рекомендуемый системный VPN: AmneziaVPN (от российской команды)</span>
                  <span className="muted"> — открыть гайд</span>
                </summary>
                <div className="zapret-howto__body">
                  <p className="modal__hint">
                    <b>AmneziaVPN</b> — open-source клиент специально для обхода блокировок в РФ.
                    Поддерживает <b>OpenVPN+Cloak</b>, <b>Shadowsocks+Cloak</b> (TCP 443 TLS — выглядит
                    как обычный HTTPS, DPI не видит) и AmneziaWG (обфусцированный WireGuard).
                    Работает <b>системно</b> — все приложения в Windows получают доступ.
                  </p>

                  <h4 className="settings-section__title">Установка</h4>
                  <ol className="steps">
                    <li>Скачай Windows-версию с <a href="https://amnezia.org/downloads" target="_blank" rel="noreferrer">amnezia.org/downloads</a> или с <a href="https://github.com/amnezia-vpn/amnezia-client/releases/latest" target="_blank" rel="noreferrer">github.com/amnezia-vpn/amnezia-client</a>.</li>
                    <li>Установи и запусти AmneziaVPN.</li>
                    <li>Можно использовать <b>бесплатные серверы команды</b> (вкладка «Free Servers» в приложении), либо настроить свой VPS за ~$5/мес — Amnezia сама развернёт сервер по SSH.</li>
                  </ol>

                  <h4 className="settings-section__title">Что выбрать в Amnezia</h4>
                  <p className="modal__hint">
                    Для жёстких блокировок: <b>OpenVPN over Cloak</b> или <b>Shadowsocks over Cloak</b> —
                    эти протоколы маскируются под HTTPS, обходят DPI. Если работает обычный
                    WireGuard — он быстрее, но в РФ часто режется.
                  </p>

                  <h4 className="settings-section__title">Использование с Chinazes</h4>
                  <p className="modal__hint">
                    Включи Amnezia системно → Chinazes автоматически использует его (как и любая программа).
                    В Chinazes выбери движок «Xray» без подписки и не нажимай Connect — трафик
                    пойдёт через системный Amnezia.
                  </p>

                  <p className="modal__hint muted">
                    Полный гайд: <a href="https://docs.amnezia.org/" target="_blank" rel="noreferrer">docs.amnezia.org</a>
                  </p>
                </div>
              </details>

              {error && <div className="error">{error}</div>}

              <div className="actions actions--footer">
                {connected ? (
                  <button className="btn btn--danger" onClick={onDisconnect} disabled={busy}>
                    Disconnect
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={onConnect} disabled={busy}>
                    Connect
                  </button>
                )}
                <div className="status-bar">
                  <span className={`pill pill--${proxyState?.status || 'disconnected'}`}>
                    <span className="dot" /> {proxyState?.status || 'disconnected'}
                  </span>
                  {proxyState?.engine && (
                    <span className="muted">engine: {proxyState.engine}</span>
                  )}
                  {proxyState?.socksPort && (
                    <span className="muted">SOCKS5 · 127.0.0.1:{proxyState.socksPort}</span>
                  )}
                  {proxyState?.scope === 'system' && (
                    <span className="pill pill--error"><span className="dot" /> system-wide</span>
                  )}
                  {proxyState?.message && <span className="muted">{proxyState.message}</span>}
                </div>
              </div>
            </section>
            </>)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
