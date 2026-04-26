// AI provider abstraction. Stores config (provider + apiKey + model) in
// userData/ai-config.json and exposes a unified `chat(messages)` API.
//
// Providers:
//   groq    — OpenAI-compatible at https://api.groq.com/openai/v1
//   gemini  — Google Generative Language API
//   openai  — https://api.openai.com/v1

const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain } = require('electron');

const PROVIDERS = {
  groq: {
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    apiKeyUrl: 'https://console.groq.com/keys',
    vision: false,
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    vision: true,
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1-mini'],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    vision: true,
  },
  deepseek: {
    label: 'DeepSeek 🇨🇳',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    vision: false,
    desc: 'Работает в РФ без VPN. Бюджетный китайский провайдер.',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  openrouter: {
    label: 'OpenRouter 🆓',
    defaultModel: 'meta-llama/llama-3.2-3b-instruct:free',
    models: [
      'meta-llama/llama-3.2-3b-instruct:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'deepseek/deepseek-chat:free',
      'mistralai/mistral-7b-instruct:free',
      'google/gemma-2-9b-it:free',
    ],
    apiKeyUrl: 'https://openrouter.ai/keys',
    vision: false,
    desc: 'Бесплатные модели (free tier) + платные. Работает в РФ.',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  gigachat: {
    label: 'GigaChat 🇷🇺',
    defaultModel: 'GigaChat',
    models: ['GigaChat', 'GigaChat-Pro', 'GigaChat-Max'],
    apiKeyUrl: 'https://developers.sber.ru/studio',
    vision: true,
    desc: 'Сбер. Работает в РФ без VPN. 1 млн токенов/мес бесплатно.',
    baseUrl: 'https://api.gigachat.ru/v1',
  },
  mistral: {
    label: 'Mistral AI 🇫🇷',
    defaultModel: 'mistral-tiny',
    models: ['mistral-tiny', 'mistral-small-latest', 'mistral-medium-latest', 'pixtral-12b-2409'],
    apiKeyUrl: 'https://console.mistral.ai/api-keys/',
    vision: true,
    desc: 'Французский провайдер. Работает в РФ. Есть бесплатный тариф.',
    baseUrl: 'https://api.mistral.ai/v1',
  },
};

let configPath;
let config = { provider: 'groq', apiKey: '', model: '' };

function init() {
  configPath = path.join(app.getPath('userData'), 'ai-config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const loaded = JSON.parse(raw);
    if (loaded && typeof loaded === 'object') config = { ...config, ...loaded };
  } catch {}
}

function save() {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('[ai] save config failed:', e?.message);
  }
}

function getConfig() {
  // Don't expose the API key to non-privileged callers; settings UI gets full
  // config through a separate channel. Renderer needs to know provider + model
  // for UI rendering only.
  return { ...config, hasKey: !!config.apiKey };
}

function getFullConfig() { return { ...config }; }

function setConfig(patch) {
  config = { ...config, ...patch };
  save();
  return getConfig();
}

// ---------------------- chat ----------------------

async function chat({ messages, provider, apiKey, model }) {
  const p = provider || config.provider;
  const key = apiKey || config.apiKey;
  const m = model || config.model || PROVIDERS[p]?.defaultModel;
  if (!PROVIDERS[p]) throw new Error('Unknown AI provider: ' + p);
  if (!key) throw new Error('AI API key not set. Open Settings → AI.');
  if (p === 'gemini') return chatGemini({ messages, key, model: m });
  return chatOpenAICompatible({ messages, key, model: m, provider: p });
}

function normalizeOpenAIMessages(messages) {
  // Convert array-style content (text + images) to OpenAI format
  return messages.map((m) => {
    if (m.role === 'system') return m;
    if (Array.isArray(m.content)) {
      return {
        role: m.role,
        content: m.content.map((c) => {
          if (c.type === 'text') return { type: 'text', text: c.text };
          if (c.type === 'image_url') return { type: 'image_url', image_url: c.image_url };
          return c;
        }),
      };
    }
    return m;
  });
}

async function chatOpenAICompatible({ messages, key, model, provider }) {
  const prov = PROVIDERS[provider] || {};
  const url = prov.baseUrl
    ? `${prov.baseUrl}/chat/completions`
    : (provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions');
  const normalized = normalizeOpenAIMessages(messages);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: normalized, temperature: 0.4 }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${provider} ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim?.() || '';
  return { reply, model };
}

function toGeminiParts(content) {
  // content can be string or array of {type, text|image_url}
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content) }];
  return content.map((c) => {
    if (c.type === 'text') return { text: c.text };
    if (c.type === 'image_url') {
      // Parse data:image/{mime};base64,{data}
      const url = c.image_url?.url || c.image_url;
      if (typeof url === 'string' && url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mime = match[1];
          const data = match[2];
          return { inlineData: { mimeType: mime, data } };
        }
      }
      // Fallback to URL reference (if not data URI)
      return { text: `[Image: ${url}]` };
    }
    return { text: String(c.text || c) };
  });
}

async function chatGemini({ messages, key, model }) {
  // Gemini expects { contents: [{ role, parts: [{ text|inlineData }] }] }
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const turns = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(m.content),
  }));
  if (sys && turns.length && turns[0].role === 'user') {
    turns[0].parts.unshift({ text: sys + '\n\n' });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: turns, generationConfig: { temperature: 0.4 } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || '';
  return { reply, model };
}

// Streaming chat. Sends incremental tokens to the renderer via ai:stream-chunk
// (channel keyed by request id) and a final ai:stream-done.
async function chatStream({ requestId, messages, provider, apiKey, model }, sender) {
  const p = provider || config.provider;
  const key = apiKey || config.apiKey;
  const m = model || config.model || PROVIDERS[p]?.defaultModel;
  const send = (channel, payload) => {
    try { sender.send(channel, { requestId, ...payload }); } catch {}
  };

  if (!PROVIDERS[p]) { send('ai:stream-done', { error: 'Unknown provider: ' + p }); return; }
  if (!key) { send('ai:stream-done', { error: 'AI API key not set. Open Settings → AI.' }); return; }

  try {
    if (p === 'gemini') {
      await streamGemini({ messages, key, model: m }, (text) => send('ai:stream-chunk', { delta: text }));
    } else {
      await streamOpenAICompat({ messages, key, model: m, provider: p }, (text) => send('ai:stream-chunk', { delta: text }));
    }
    send('ai:stream-done', {});
  } catch (e) {
    send('ai:stream-done', { error: e?.message || String(e) });
  }
}

async function streamOpenAICompat({ messages, key, model, provider }, onChunk) {
  const prov = PROVIDERS[provider] || {};
  const url = prov.baseUrl
    ? `${prov.baseUrl}/chat/completions`
    : (provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions');
  const normalized = normalizeOpenAIMessages(messages);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: normalized, temperature: 0.4, stream: true }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${provider} ${res.status}: ${t.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta = j?.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

async function streamGemini({ messages, key, model }, onChunk) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const turns = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(m.content),
  }));
  if (sys && turns.length && turns[0].role === 'user') {
    turns[0].parts.unshift({ text: sys + '\n\n' });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: turns, generationConfig: { temperature: 0.4 } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const j = JSON.parse(data);
        const delta = j?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

function register() {
  ipcMain.handle('ai:get-config',   ()      => getConfig());
  ipcMain.handle('ai:get-full',     ()      => getFullConfig());
  ipcMain.handle('ai:set-config',   (_e, p) => setConfig(p));
  ipcMain.handle('ai:providers',    ()      => PROVIDERS);
  ipcMain.handle('ai:chat',         (_e, args) => chat(args || {}));
  ipcMain.on('ai:chat-stream', (e, args) => chatStream(args || {}, e.sender));
}

module.exports = { init, register };
