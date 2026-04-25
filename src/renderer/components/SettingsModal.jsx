import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldIcon } from './Icons.jsx';
import { THEMES, getStoredTheme, setStoredTheme } from '../themes.js';
import { UA_PRESETS, getStoredUA, setStoredUA } from '../user-agents.js';
import { FREE_POOLS } from '../free-pools.js';
import { detectCountry } from '../country-flags.js';

const FREE_POOL_URLS = new Set(FREE_POOLS.map((p) => p.url));
const SAFETY_ACK_KEY = 'chinazes:free-pool-safety-ack';

const ENGINES = [
  { id: 'warp', name: '🛡️ WARP+ (Recommended)', desc: 'Cloudflare WARP через warp-plus: авто-сканер endpoint + обфускация. UDP — у некоторых провайдеров может не работать.' },
  { id: 'xray', name: 'Xray / v2ray',            desc: 'VLESS/VMess/Trojan/SS/Hysteria2 + подписки. Включи фильтр «Только CDN (WS+TLS)» — TCP 443 TLS, лучше работает в РФ.' },
];

export default function SettingsModal({ open, onClose, proxyState }) {
  const [tab, setTab] = useState('connection'); // 'connection' | 'appearance'
  const [engine, setEngine] = useState('warp');
  const [config, setConfig] = useState(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme());
  const [uaId, setUaId] = useState(getStoredUA());
  const [latencies, setLatencies] = useState([]);   // ms or null per server
  const [probing, setProbing] = useState(false);
  const [hideUnreachable, setHideUnreachable] = useState(true);
  const [cdnOnly, setCdnOnly] = useState(false);
  const [countryFilter, setCountryFilter] = useState('all');
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [pendingPoolUrl, setPendingPoolUrl] = useState('');

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
    setEngine(cfg.engine || 'xray');
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
                className={`modal__seg-btn ${tab === 'appearance' ? 'modal__seg-btn--active' : ''}`}
                onClick={() => setTab('appearance')}
              >Appearance</button>
            </div>

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

              {engine === 'warp' && (
                <div className="engine-panel">
                  <p className="modal__hint">
                    <b>🛡️ WARP+ Recommended — just works.</b> Использует Cloudflare WARP, но через
                    <b> warp-plus</b> с авто-сканером рабочих эндпоинтов и AmneziaWG-обфускацией —
                    обходит блокировки UDP и DPI в РФ. Без аккаунтов, без серверов, не требует админ-прав.
                  </p>

                  <ol className="steps">
                    <li>Скачай последний релиз с <a href="https://github.com/bepass-org/warp-plus/releases/latest" target="_blank" rel="noreferrer">github.com/bepass-org/warp-plus</a> (файл <code>warp-plus_windows-amd64.zip</code>).</li>
                    <li>Распакуй <code>warp-plus.exe</code> в:<br/><code>resources/warp-plus/warp-plus.exe</code></li>
                    <li>Нажми <b>Connect</b>. Первый запуск ~30 сек (сканирует endpoint), потом мгновенный.</li>
                  </ol>
                  <p className="modal__hint muted">
                    Локальный SOCKS5 на <code>127.0.0.1:8086</code>. Кеш сканера и WG-конфиг хранятся
                    в <code>%APPDATA%/Chinazes/warp-plus-cache/</code>. Если перестало работать —
                    удали кеш, при следующем Connect пересканирует.
                  </p>
                </div>
              )}

              <details className="zapret-howto" open>
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

              <details className="zapret-howto">
                <summary>
                  <span>💡 Бонус: системный обход DPI через Zapret (без VPN)</span>
                  <span className="muted"> — открыть гайд</span>
                </summary>
                <div className="zapret-howto__body">
                  <p className="modal__hint">
                    <b>Zapret</b> (bol-van/zapret) — обход DPI через фрагментацию пакетов.
                    Не VPN — IP не меняет. Работает <b>системно</b> (для всех приложений Windows,
                    включая Chinazes, браузер, игры). Бесплатно, без серверов.
                    <br/><b>Запускается отдельно от Chinazes</b> — мы не встраиваем его, чтобы избежать
                    проблем с правами и совместимостью.
                  </p>

                  <h4 className="settings-section__title">Установка</h4>
                  <ol className="steps">
                    <li>Скачай последний релиз с <a href="https://github.com/bol-van/zapret-win-bundle/releases/latest" target="_blank" rel="noreferrer">github.com/bol-van/zapret-win-bundle</a> (файл <code>zapret-winws.zip</code>).</li>
                    <li>Распакуй в любую папку, например <code>C:\Tools\zapret\</code>.</li>
                    <li>Установи WinDivert-драйвер: запусти <code>service_install_russia_blacklist.cmd</code> от имени администратора.</li>
                    <li>Готово — Zapret теперь работает как Windows-сервис, автозапуск при старте системы.</li>
                  </ol>

                  <h4 className="settings-section__title">Запуск без установки сервиса</h4>
                  <ol className="steps">
                    <li>Открой папку с распакованным архивом.</li>
                    <li>Двойной клик на <code>quick_start_russia_blacklist.cmd</code> (откроется консоль — не закрывай её, пока нужен обход).</li>
                    <li>Когда не нужен — закрой консоль, всё.</li>
                  </ol>

                  <h4 className="settings-section__title">Проверка работы</h4>
                  <p className="modal__hint">
                    Открой YouTube в обычном Chrome/Edge — если видео грузится без замедления,
                    значит работает. Если нет — попробуй другой <code>.cmd</code>-пресет
                    (есть варианты для Discord, общие, обходящие конкретные DPI-приставки).
                  </p>

                  <h4 className="settings-section__title">Удаление</h4>
                  <p className="modal__hint">
                    Запусти <code>service_remove.cmd</code> от админа — снимет сервис и драйвер.
                  </p>

                  <p className="modal__hint muted">
                    Полный гайд и список стратегий: <a href="https://github.com/bol-van/zapret/blob/master/docs/quick_start.md" target="_blank" rel="noreferrer">github.com/bol-van/zapret/blob/master/docs/quick_start.md</a>
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
