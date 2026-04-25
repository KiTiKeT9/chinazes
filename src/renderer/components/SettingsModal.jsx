import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldIcon } from './Icons.jsx';
import StrategyPicker from './StrategyPicker.jsx';

const ENGINES = [
  { id: 'xray',   name: 'Xray / v2ray', desc: 'VLESS, VMess, Trojan, Shadowsocks, Hysteria2 + подписки' },
  { id: 'warp',   name: 'Cloudflare WARP', desc: 'Бесплатный, SOCKS5-режим — работает только в приложении' },
  { id: 'zapret', name: 'Zapret (DPI bypass)', desc: 'Системно, без впн. Нужны админ-права' },
];

export default function SettingsModal({ open, onClose, proxyState }) {
  const [engine, setEngine] = useState('xray');
  const [config, setConfig] = useState(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [zapretStrategies, setZapretStrategies] = useState([]);
  const [zapretStrategy, setZapretStrategyState] = useState('builtin');

  useEffect(() => {
    if (!open) return;
    reload();
  }, [open]);

  async function reload() {
    const cfg = await window.chinazes.proxy.getConfig();
    setConfig(cfg);
    setEngine(cfg.engine || 'xray');
    setLink(cfg.xray?.subscription || cfg.xray?.link || '');
    setZapretStrategyState(cfg.zapret?.strategy || 'builtin');
    setError('');
    try {
      const list = await window.chinazes.proxy.listZapretStrategies();
      setZapretStrategies(list || []);
    } catch { /* ignore */ }
  }

  async function onPickStrategy(name) {
    setZapretStrategyState(name);
    try { await window.chinazes.proxy.setZapretStrategy(name); }
    catch (e) { setError(String(e?.message || e)); }
  }

  async function onImport() {
    setBusy(true); setError('');
    try {
      await window.chinazes.proxy.importLink(link.trim());
      await reload();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  async function onRefresh() {
    setBusy(true); setError('');
    try {
      await window.chinazes.proxy.refreshSubscription();
      await reload();
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
                <span>Proxy settings</span>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </header>

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
                  <label className="field">
                    <span>Ссылка / подписка</span>
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
                  </div>

                  {servers.length > 0 && (
                    <div className="server-list">
                      <div className="server-list__title">
                        Servers ({servers.length})
                        {config?.xray?.subscription && (
                          <span className="muted"> · {new URL(config.xray.subscription).host}</span>
                        )}
                      </div>
                      <div className="server-list__items">
                        {servers.map((s, i) => (
                          <button
                            key={i}
                            className={`server-row ${i === selectedIdx ? 'server-row--active' : ''}`}
                            onClick={() => onSelectServer(i)}
                            disabled={busy}
                          >
                            <span className="server-row__proto">{s.meta.protocol}</span>
                            <span className="server-row__name">{s.meta.name || '(unnamed)'}</span>
                            <span className="server-row__addr muted">
                              {s.meta.address}:{s.meta.port}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {engine === 'warp' && (
                <div className="engine-panel">
                  <p className="modal__hint">
                    Cloudflare <b>WARP</b> — бесплатный обход, работает в <b>SOCKS5-режиме</b>,
                    трафик идёт только через приложение.
                  </p>
                  <ol className="steps">
                    <li>Установи бесплатное приложение <b>1.1.1.1 / WARP</b> с <a href="https://1.1.1.1/" target="_blank" rel="noreferrer">1.1.1.1</a>.</li>
                    <li>После установки закрой его — нам нужен только <code>warp-cli</code> в PATH.</li>
                    <li>Нажми <b>Connect</b> ниже. Первый запуск зарегистрирует бесплатный аккаунт.</li>
                  </ol>
                  <p className="modal__hint muted">
                    Локальный SOCKS5 будет на <code>127.0.0.1:40000</code>, применяется к webview приложения.
                  </p>
                </div>
              )}

              {engine === 'zapret' && (
                <div className="engine-panel">
                  <p className="modal__hint">
                    <b>Zapret</b> (bol-van/zapret2) — обход DPI через фрагментацию пакетов.
                    Не VPN — не меняет IP. Работает <b>системно</b>.
                    Запусти Chinazes <b>от имени администратора</b>.
                  </p>

                  <div className="field">
                    <span className="field__label">Стратегия</span>
                    <StrategyPicker
                      value={zapretStrategy}
                      options={zapretStrategies}
                      onChange={onPickStrategy}
                    />
                  </div>
                  <p className="modal__hint muted">
                    Built-in — встроенная универсальная стратегия (YouTube/Discord/HTTPS).
                    Остальные — пресеты из <code>resources/zapret/bat/</code>; если built-in
                    не справляется на твоём провайдере, попробуй разные.
                    Изменение применяется при следующем Connect.
                  </p>
                </div>
              )}

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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
