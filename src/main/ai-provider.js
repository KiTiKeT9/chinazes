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
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    apiKeyUrl: 'https://aistudio.google.com/apikey',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1-mini'],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
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

async function chatOpenAICompatible({ messages, key, model, provider }) {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.4 }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${provider} ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim?.() || '';
  return { reply, model };
}

async function chatGemini({ messages, key, model }) {
  // Gemini expects { contents: [{ role, parts: [{ text }] }] } with role
  // 'user' or 'model'. System messages are concatenated as a leading user
  // turn for compatibility.
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const turns = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  if (sys && turns.length && turns[0].role === 'user') {
    turns[0].parts[0].text = sys + '\n\n' + turns[0].parts[0].text;
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

function register() {
  ipcMain.handle('ai:get-config',   ()      => getConfig());
  ipcMain.handle('ai:get-full',     ()      => getFullConfig());
  ipcMain.handle('ai:set-config',   (_e, p) => setConfig(p));
  ipcMain.handle('ai:providers',    ()      => PROVIDERS);
  ipcMain.handle('ai:chat',         (_e, args) => chat(args || {}));
}

module.exports = { init, register };
