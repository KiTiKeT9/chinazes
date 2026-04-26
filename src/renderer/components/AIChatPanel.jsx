import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const HISTORY_KEY = 'chinazes:ai-history';
const SYSTEM_PROMPT = 'Ты — встроенный AI-ассистент в Chinazes. Отвечай кратко, на языке пользователя. Markdown допустим.';

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function saveHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-200))); } catch {}
}

export default function AIChatPanel({ open, onClose }) {
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => { saveHistory(messages); }, [messages]);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open, busy]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const panel = document.querySelector('.ai-chat-panel');
      if (panel && !panel.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open, onClose]);

  function clear() {
    if (busy) return;
    setMessages([]);
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg = { role: 'user', content: text };
    const next = [...messages, userMsg, { role: 'assistant', content: '' }];
    setMessages(next);
    setInput('');
    setBusy(true);

    const history = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...next.filter((m) => m.role !== 'assistant' || m.content), // last empty assistant excluded
    ];
    let buffer = '';
    cancelRef.current = window.chinazes.ai.chatStream(
      { messages: history.slice(0, -1) }, // drop the placeholder
      (delta) => {
        buffer += delta;
        setMessages((cur) => {
          const arr = [...cur];
          arr[arr.length - 1] = { role: 'assistant', content: buffer };
          return arr;
        });
      },
      (res) => {
        cancelRef.current = null;
        setBusy(false);
        if (res?.error) {
          setMessages((cur) => {
            const arr = [...cur];
            arr[arr.length - 1] = { role: 'assistant', content: `⚠ ${res.error}\n\nПроверь Settings → AI.` };
            return arr;
          });
        }
      }
    );
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ai-chat-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.aside
            className="ai-chat-panel"
            initial={{ x: 460 }} animate={{ x: 0 }} exit={{ x: 460 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <header className="ai-chat-panel__header">
              <div className="ai-chat-panel__title">✨ AI чат</div>
              <button className="btn btn--ghost btn--small" onClick={clear} disabled={busy} title="Очистить историю">🗑</button>
              <button className="modal__close" onClick={onClose}>×</button>
            </header>

            <div className="ai-chat-panel__body" ref={bodyRef}>
              {messages.length === 0 && (
                <div className="ai-chat-empty">
                  <p>Спроси что угодно. История сохраняется локально.</p>
                  <p className="muted">Настрой провайдера в Settings → AI.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`ai-msg ai-msg--${m.role}`}>
                  <div className="ai-msg__role">{m.role === 'user' ? 'Ты' : '✨'}</div>
                  <div className="ai-msg__bubble">{m.content || (busy && i === messages.length - 1 ? '⏳' : '')}</div>
                </div>
              ))}
            </div>

            <form
              className="ai-chat-panel__input"
              onSubmit={(e) => { e.preventDefault(); send(); }}
            >
              <textarea
                className="input ai-chat-textarea"
                placeholder="Спроси что-нибудь… (Enter — отправить, Shift+Enter — перенос)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={2}
                disabled={busy}
              />
              <button type="submit" className="btn btn--primary" disabled={busy || !input.trim()}>
                {busy ? '...' : '→'}
              </button>
            </form>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
