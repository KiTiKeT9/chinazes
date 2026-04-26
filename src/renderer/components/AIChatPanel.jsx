import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const HISTORY_KEY = 'chinazes:ai-history';
const SYSTEM_PROMPT = 'Ты — встроенный AI-ассистент в Chinazes. Отвечай кратко, на языке пользователя. Markdown допустим.';

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

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
  const fileInputRef = useRef(null);

  // Voice recognition state
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  // Image attachments for the next message
  const [attachedImages, setAttachedImages] = useState([]);

  // Init speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = 'ru-RU';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput((s) => (s ? s + ' ' : '') + transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  function toggleListening() {
    const rec = recognitionRef.current;
    if (!rec) { alert('Голосовой ввод не поддерживается в этом браузере'); return; }
    if (listening) { rec.stop(); setListening(false); }
    else { rec.start(); setListening(true); }
  }

  function attachImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      setAttachedImages((arr) => [...arr, { name: file.name, base64 }]);
    };
    reader.readAsDataURL(file);
  }

  function removeAttachedImage(idx) {
    setAttachedImages((arr) => arr.filter((_, i) => i !== idx));
  }

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

  // Listen for images sent from Notes panel
  useEffect(() => {
    function onSendToAI(e) {
      const { imageUrl, prompt } = e.detail || {};
      if (!imageUrl) return;
      // Open panel and attach image
      onClose?.(); // will be reopened by parent
      setTimeout(() => {
        // Fetch the image and convert to base64
        fetch(imageUrl)
          .then(r => r.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result;
              setAttachedImages([{ name: 'image.png', base64 }]);
              if (prompt) setInput(prompt);
            };
            reader.readAsDataURL(blob);
          })
          .catch(() => {});
      }, 50);
    }
    window.addEventListener('chinazes:send-to-ai', onSendToAI);
    return () => window.removeEventListener('chinazes:send-to-ai', onSendToAI);
  }, [onClose]);

  function clear() {
    if (busy) return;
    setMessages([]);
  }

  function send() {
    const text = input.trim();
    if ((!text && attachedImages.length === 0) || busy) return;

    // Build user message with optional images
    const userContent = [];
    if (text) userContent.push({ type: 'text', text });
    for (const img of attachedImages) {
      userContent.push({ type: 'image_url', image_url: { url: img.base64 } });
    }
    const userMsg = { role: 'user', content: userContent.length === 1 ? userContent[0].text || userContent[0] : userContent };

    const next = [...messages, userMsg, { role: 'assistant', content: '' }];
    setMessages(next);
    setInput('');
    setAttachedImages([]);
    setBusy(true);

    const history = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...next.filter((m) => m.role !== 'assistant' || m.content),
    ];
    let buffer = '';
    cancelRef.current = window.chinazes.ai.chatStream(
      { messages: history.slice(0, -1) },
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

  // Video URL detection for download button
  const VIDEO_URL_REGEX = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|tiktok\.com|instagram\.com\/reel|twitter\.com|x\.com)\/[^\s]+/i;
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  const videoUrlMatch = typeof lastUserMessage === 'string' ? lastUserMessage.match(VIDEO_URL_REGEX) : null;

  function downloadVideo() {
    if (videoUrlMatch) {
      window.chinazes?.notes?.downloadVideo?.(videoUrlMatch[0]);
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

            {/* Attached images preview */}
            {attachedImages.length > 0 && (
              <div className="ai-chat-attachments">
                {attachedImages.map((img, i) => (
                  <div key={i} className="ai-chat-attachment">
                    <img src={img.base64} alt="" />
                    <button className="ai-chat-attachment__remove" onClick={() => removeAttachedImage(i)} title="Убрать">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div className="ai-chat-quick-actions">
              {attachedImages.length > 0 && (
                <>
                  <button type="button" className="ai-chip" onClick={() => setInput('Опиши подробно что на этом изображении')} disabled={busy}>🔍 Описать</button>
                  <button type="button" className="ai-chip" onClick={() => setInput('Предложи как улучшить это изображение')} disabled={busy}>✨ Улучшить</button>
                </>
              )}
              {videoUrlMatch && (
                <button type="button" className="ai-chip ai-chip--accent" onClick={downloadVideo} disabled={busy}>📥 Скачать видео</button>
              )}
              <button type="button" className="ai-chip" onClick={() => setInput('Суммаризируй последние сообщения')} disabled={busy}>📝 Саммари</button>
              <button type="button" className="ai-chip" onClick={() => setInput('Помоги составить ответ…')} disabled={busy}>💬 Помощь с ответом</button>
            </div>

            <form
              className="ai-chat-panel__input"
              onSubmit={(e) => { e.preventDefault(); send(); }}
            >
              <button
                type="button"
                className={`btn btn--ghost ai-chat-voice ${listening ? 'ai-chat-voice--active' : ''}`}
                onClick={toggleListening}
                title={listening ? 'Слушаю… (нажми чтобы остановить)' : 'Голосовой ввод'}
                disabled={busy}
              >
                {listening ? <StopIcon /> : <MicIcon />}
              </button>

              <textarea
                className="input ai-chat-textarea input--dark"
                placeholder={listening ? 'Говорите…' : 'Спроси что-нибудь… (Enter — отправить, Shift+Enter — перенос)'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={2}
                disabled={busy || listening}
              />

              <button
                type="button"
                className="btn btn--ghost ai-chat-img-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Прикрепить фото"
                disabled={busy}
              >
                <ImageIcon />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  for (const f of e.target.files) attachImage(f);
                  e.target.value = '';
                }}
              />

              <button type="submit" className="btn btn--primary" disabled={busy || (!input.trim() && attachedImages.length === 0)}>
                {busy ? '...' : '→'}
              </button>
            </form>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
