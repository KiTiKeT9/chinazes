import React, { useEffect, useState } from 'react';

// Replicates the Zapret 2 main page: status cards + quick actions.
// Doesn't embed the actual Zapret window (admin/UIPI restrictions).
// Instead: polls the system for Zapret state and provides shortcuts to
// the real Zapret.exe GUI for advanced configuration.

export default function ZapretPanel({ visible, onOpenSettings }) {
  const [status, setStatus]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest]       = useState(null);

  async function refresh() {
    try {
      const s = await window.chinazes.zapret.status();
      setStatus(s);
      setError('');
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  // Poll while visible.
  useEffect(() => {
    if (!visible) return;
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [visible]);

  async function action(name, fn) {
    try {
      setBusy(true); setError('');
      await fn();
      // Re-check status after admin actions (UAC dialog, then process appears).
      setTimeout(refresh, 1500);
    } catch (e) {
      setError(`${name}: ${e.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    try {
      setTesting(true); setError('');
      const r = await window.chinazes.zapret.testConnection();
      setTest(r);
    } catch (e) {
      setError(`Тест: ${e.message || String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  if (!visible) return null;

  if (!status) {
    return (
      <div className="zapret-panel zapret-panel--loading">
        <div className="zapret-panel__spinner" />
        <p>Проверяем состояние Zapret 2…</p>
        {error && <pre className="zapret-panel__err">{error}</pre>}
      </div>
    );
  }

  if (!status.installed) {
    return (
      <div className="zapret-panel zapret-panel--empty">
        <div className="zapret-panel__empty-icon">⚡</div>
        <h2>Zapret 2 не установлен</h2>
        <p>
          Системный обход DPI на уровне пакетов. Работает для всего ПК — Chinazes,
          браузер, Discord, игры.
        </p>
        <a
          className="zapret-panel__cta"
          href="https://github.com/youtubediscord/zapret/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          Скачать установщик
        </a>
        <p className="zapret-panel__muted">
          После установки запустите Zapret 2 один раз и нажмите F5 здесь.
        </p>
      </div>
    );
  }

  const bypass = status.bypassActive;

  return (
    <div className="zapret-panel">
      <div className="zapret-panel__header">
        <div>
          <h1 className="zapret-panel__title">Главная</h1>
          <p className="zapret-panel__subtitle">Обзор состояния Zapret</p>
        </div>
        <div className="zapret-panel__version">v{status.version || '—'}</div>
      </div>

      <div className="zapret-panel__cards">
        <Card
          icon="🛡️"
          label="Статус Zapret"
          value={bypass ? 'Запущен' : 'Остановлен'}
          accent={bypass ? 'green' : 'red'}
          desc={bypass ? 'Обход блокировок активен — кликните для управления' : 'Кликните, чтобы запустить через GUI'}
          onClick={() => action('Открыть GUI', window.chinazes.zapret.openGui)}
        />
        <Card
          icon="⚙️"
          label="Метод запуска"
          value="Zapret 2"
          accent="neutral"
          desc="Кликните — обзор движков в Settings"
          onClick={onOpenSettings}
        />
        <Card
          icon="🚀"
          label="GUI Zapret"
          value={status.guiRunning ? 'Открыт' : 'Закрыт'}
          accent={status.guiRunning ? 'green' : 'neutral'}
          desc={status.guiRunning ? 'Окно настроек запущено — кликните, чтобы вынести на передний план' : 'Кликните, чтобы открыть'}
          onClick={() => action('Открыть GUI', window.chinazes.zapret.openGui)}
        />
        <Card
          icon="⭐"
          label="Подписка"
          value="Free"
          accent="yellow"
          desc="Кликните — узнать о Premium"
          onClick={() => window.open('https://github.com/youtubediscord/zapret', '_blank')}
        />
      </div>

      <h3 className="zapret-panel__section">Быстрые действия</h3>
      <div className="zapret-panel__actions">
        <button
          className="zapret-panel__btn"
          disabled={busy}
          onClick={() => action('Открыть GUI', window.chinazes.zapret.openGui)}
          title="Открыть полное окно настроек Zapret 2 (требуется права администратора)"
        >
          🎛️ Открыть GUI
        </button>
        <button
          className="zapret-panel__btn"
          disabled={testing}
          onClick={runTest}
        >
          {testing ? '⏳ Тестируем…' : '📡 Тест соединения'}
        </button>
        <button
          className="zapret-panel__btn"
          disabled={busy}
          onClick={() => action('Открыть папку', window.chinazes.zapret.openFolder)}
        >
          📂 Открыть папку
        </button>
        <a
          className="zapret-panel__btn"
          href="https://github.com/youtubediscord/zapret#readme"
          target="_blank"
          rel="noreferrer"
        >
          ❓ Как использовать
        </a>
      </div>

      {test && (
        <div className="zapret-panel__test">
          <h3 className="zapret-panel__section">Результат теста</h3>
          <div className="zapret-panel__test-grid">
            {test.map((r) => (
              <div key={r.name} className={`zapret-panel__test-row ${r.ok ? 'ok' : 'fail'}`}>
                <span className="zapret-panel__test-name">{r.name}</span>
                <span className="zapret-panel__test-host">{r.host}</span>
                <span className="zapret-panel__test-result">
                  {r.ok ? `✅ ${r.ms}ms` : `❌ ${r.error}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="zapret-panel__section">Статус</h3>
      <div className="zapret-panel__status-row">
        <span className="zapret-panel__dot" />
        <span>Установлена версия {status.version || '—'}</span>
      </div>
      <div className="zapret-panel__status-row">
        <span className={`zapret-panel__dot ${bypass ? 'on' : 'off'}`} />
        <span>{bypass ? 'Worker winws запущен — обход активен' : 'Worker winws не запущен'}</span>
      </div>

      {error && <pre className="zapret-panel__err">{error}</pre>}
    </div>
  );
}

function Card({ icon, label, value, accent, desc, onClick }) {
  return (
    <div
      className={`zcard zcard--${accent} ${onClick ? 'zcard--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="zcard__head">
        <span className="zcard__icon">{icon}</span>
        <span className="zcard__label">{label}</span>
      </div>
      <div className="zcard__value">{value}</div>
      <div className="zcard__desc">{desc}</div>
    </div>
  );
}
