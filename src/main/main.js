const { app, BrowserWindow, ipcMain, session, protocol, nativeTheme, desktopCapturer } = require('electron');

// Custom protocol for serving user notes (must be registered before app ready).
protocol.registerSchemesAsPrivileged([
  { scheme: 'chinazes-note', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

// Disable Chromium features that trigger Windows Hello / security-key UI on page load.
// Sites probing `navigator.credentials.get()` would otherwise pop the system dialog.
app.commandLine.appendSwitch(
  'disable-features',
  [
    'WebAuthentication',                  // master kill-switch
    'WebAuthenticationCable',             // cross-device passkey (phone QR)
    'WebAuthnUseNativeWinApi',            // Windows Hello integration
    'WinrtUtilWebAuthn',
    'EnclaveAuthenticator',
    'FidoConservativeProcessing',
    'WebAuthnConditionalUI',              // silent autofill probe
  ].join(',')
);
const path = require('node:path');
const fs = require('node:fs');
const proxyManager = require('./proxy-manager');
const updater = require('./updater');
const notes = require('./notes');
const videoDownloader = require('./video-downloader');
const aiProvider = require('./ai-provider');
const appsScanner = require('./apps-scanner');
const netMonitor = require('./net-monitor');
const { getOrchestrator } = require('./airi-orchestrator');
const { getTelegramBridge } = require('./telegram-bridge');
const { getWebSearch } = require('./web-search');

let mainWindow;
let youtubeMiniPlayer; // YouTube mini player window (picture-in-picture style)

// Single-instance: if another copy of Chinazes is already running, focus it and quit.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('app:second-instance');
});

const SERVICE_PARTITIONS = [
  'persist:telegram',
  'persist:discord',
  'persist:youtube',
  'persist:tiktok',
  'persist:steam',
  'persist:google',
  'persist:gmail',
  'persist:twitch',
  'persist:vk',
  'persist:instagram',
  'persist:x',
  'persist:spotify',
  'persist:yamusic',
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0b0b10',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  // Open maximized by default — feels more like a full app and gives webviews room.
  mainWindow.maximize();

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Re-apply current proxy state + UA/preload/permissions to every webview
  // session as it gets created. Built-in service partitions are pre-warmed in
  // `app.whenReady`, but **custom user services** use ad-hoc partitions
  // (persist:custom-<id>) we can't enumerate up-front — without this hook they
  // would never receive the WEBVIEW_PRELOAD and therefore never emit
  // chinazes:media-state events to the music bar, and would leak the Electron
  // user-agent to strict sites.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      try { suppressSecurityPrompts(contents.session); } catch {}
      try { proxyManager.applyToSession(contents.session); } catch {}
      // Forward Ctrl+1…9 / Ctrl+0 hotkeys from inside webviews to the host
      // renderer. Without this the keystroke is consumed by the focused page
      // (e.g. YouTube treats Ctrl+1 as a no-op, Discord steals digits, etc.).
      try {
        contents.on('before-input-event', (event, input) => {
          if (input.type !== 'keyDown') return;
          if (!input.control || input.shift || input.alt || input.meta) return;
          if (input.key < '0' || input.key > '9') return;
          event.preventDefault();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:hotkey', { key: input.key });
          }
        });
      } catch {}
    }
  });
}

async function applyProxyToAllServiceSessions() {
  for (const partition of SERVICE_PARTITIONS) {
    const ses = session.fromPartition(partition);
    await proxyManager.applyToSession(ses);
  }
}

// Suppress Windows smart card / security key prompt that pops up when a site
// requests a TLS client certificate. We don't have any to offer.
app.on('select-client-certificate', (event, _wc, _url, _list, callback) => {
  event.preventDefault();
  callback(null);
});

// Suppress smart-card / security-key prompts in EVERY session (default + webview partitions).
// The `select-client-certificate` event fires per-session, not on app, so we attach handlers
// individually. We also deny any USB/serial permission so WebAuthn can't trigger Windows Hello.
const WEBVIEW_PRELOAD = path.join(__dirname, 'webview-preload.js');

// Default Chrome UA — applied to every session at creation time. Without this,
// Electron's UA contains "Electron/<ver>" which Discord (and others) detect and
// use to disable features like screen-sharing, native push, etc.
// Chrome version is pulled dynamically from the embedded Chromium, floored at 135
// to avoid YouTube serving different codecs to "older" browsers.
const _chromeVer = process.versions.chrome;
const _chromeMajor = String(Math.max(parseInt(_chromeVer.split('.')[0], 10), 135));
const _chromeMinor = _chromeMajor === '135' ? '0.0.0' : _chromeVer.split('.').slice(1).join('.');
const DEFAULT_CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${_chromeMajor}.${_chromeMinor} Safari/537.36`;

// Chrome's client-hints headers (Sec-CH-UA*). Electron's default emits
// "Chromium" + "Not A Brand" instead of "Google Chrome", which strict sites
// (Spotify, VK, banking portals) treat as suspicious and trap in a redirect
// loop. We rewrite these on every webview request to mimic real Chrome.
const CH_UA       = `"Google Chrome";v="${_chromeMajor}", "Chromium";v="${_chromeMajor}", "Not.A/Brand";v="99"`;
const CH_UA_MOBILE = '?0';
const CH_UA_PLAT   = '"Windows"';

const _hardenedSessions = new WeakSet();
function suppressSecurityPrompts(ses) {
  if (!ses) return;
  // Idempotent: web-contents-created fires for every webview, but the same
  // partition is shared across many — only harden once.
  if (_hardenedSessions.has(ses)) return;
  _hardenedSessions.add(ses);
  // Apply Chrome-like UA *before* the first webview navigates.
  try { ses.setUserAgent(DEFAULT_CHROME_UA); } catch {}
  // Rewrite client-hints headers so sites that look at Sec-CH-UA agree with
  // the UA string. We strip ALL existing Sec-CH-UA* variants (regardless of
  // case Electron used) and inject a clean Chrome-shaped set on every HTTPS
  // request — Chrome sends these unconditionally, so doing the same is safe.
  try {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = details.requestHeaders || {};
      // Strip any existing variants (Electron sends mixed-case).
      for (const k of Object.keys(h)) {
        const low = k.toLowerCase();
        if (low === 'sec-ch-ua' || low === 'sec-ch-ua-mobile' || low === 'sec-ch-ua-platform' ||
            low === 'sec-ch-ua-platform-version' || low === 'sec-ch-ua-arch' ||
            low === 'sec-ch-ua-bitness' || low === 'sec-ch-ua-full-version' ||
            low === 'sec-ch-ua-full-version-list' || low === 'sec-ch-ua-model' ||
            low === 'sec-ch-ua-wow64') {
          delete h[k];
        }
      }
      // Only inject on HTTPS (matches Chrome behavior — never on http://).
      if (details.url && details.url.startsWith('https://')) {
        h['sec-ch-ua']          = CH_UA;
        h['sec-ch-ua-mobile']   = CH_UA_MOBILE;
        h['sec-ch-ua-platform'] = CH_UA_PLAT;
      }
      callback({ requestHeaders: h });
    });
  } catch {}
  // Inject WebAuthn stub before any page JS runs.
  try {
    const existing = ses.getPreloads ? ses.getPreloads() : [];
    if (!existing.includes(WEBVIEW_PRELOAD)) {
      ses.setPreloads([...existing, WEBVIEW_PRELOAD]);
    }
  } catch {}
  ses.on('select-client-certificate', (event, _url, _list, callback) => {
    event.preventDefault();
    callback(null);
  });
  const denyHandler = (_wc, perm, callback) => callback(false);
  ses.setPermissionRequestHandler((_wc, perm, cb) => {
    // Deny USB/serial/HID/bluetooth that could surface security-key UI.
    if (['usb', 'serial', 'hid', 'bluetooth'].includes(perm)) return cb(false);
    cb(true);
  });
  // Some Chromium permissions are checked synchronously (e.g. Notification.permission)
  // and need a separate handler — without this, sites see "default" / "denied" and
  // never even ask the user, so desktop notifications stay silent.
  // Notifications always granted — site-side patch in webview-preload.js
  // relies on Notification.permission === 'granted' to fire.
  ses.setPermissionCheckHandler((_wc, perm) => {
    if (perm === 'notifications') return true;
    if (['usb', 'serial', 'hid', 'bluetooth'].includes(perm)) return false;
    return true;
  });
  // Block WebUSB/HID device chooser that triggers the Windows security key dialog.
  ses.on('select-usb-device',       (e, _d, cb) => { e.preventDefault(); cb?.(); });
  ses.on('select-hid-device',       (e, _d, cb) => { e.preventDefault(); cb?.(); });
  ses.on('select-serial-port',      (e, _d, cb) => { e.preventDefault(); cb?.(''); });

  // Discord screen-sharing support (and any other site calling getDisplayMedia).
  // We surface a custom picker UI in the renderer instead of auto-selecting the
  // primary screen — otherwise users could only ever share their main display
  // and never a specific window.
  try {
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 200 },
          fetchWindowIcons: true,
        });
        const payload = sources.map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail?.toDataURL?.() || '',
          appIcon: s.appIcon?.toDataURL?.() || '',
          isScreen: s.id.startsWith('screen:'),
        }));
        const picked = await askRendererForSource(payload);
        if (!picked) return callback({});
        const source = sources.find((s) => s.id === picked);
        if (!source) return callback({});
        callback({ video: source, audio: 'loopback' });
      } catch (e) {
        console.error('[screen-share] handler failed', e);
        try { callback({}); } catch {}
      }
    });
  } catch {}
}

// Bridge between main's getDisplayMedia handler and the renderer picker UI.
// Each request gets a unique id; renderer responds with `screen-share:answer`.
let nextScreenShareId = 1;
const pendingScreenShare = new Map(); // id -> { resolve }

function askRendererForSource(sources) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) return resolve(null);
    const requestId = nextScreenShareId++;
    pendingScreenShare.set(requestId, resolve);
    mainWindow.webContents.send('screen-share:request', { requestId, sources });
    // Safety timeout: cancel after 60s.
    setTimeout(() => {
      if (pendingScreenShare.has(requestId)) {
        pendingScreenShare.delete(requestId);
        resolve(null);
      }
    }, 60_000);
  });
}

// IPC: download a video URL (yt-dlp) into notesDir and add it as a note.
ipcMain.handle('notes:download-video', async (e, url) => {
  const sender = e.sender;
  const sendProgress = (p) => {
    try { sender.send('notes:download-progress', { url, ...p }); } catch {}
  };
  try {
    sendProgress({ phase: 'starting' });
    const file = await videoDownloader.downloadVideo(url, notes.getNotesDir(), sendProgress);
    const note = notes.addExistingFile({ file, type: 'video', label: path.basename(file) });
    sendProgress({ phase: 'done', noteId: note?.id });
    // Refresh notes list in any open NotesPanel.
    try {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('notes:changed'));
    } catch {}
    return { ok: true, note };
  } catch (err) {
    sendProgress({ phase: 'error', message: err.message });
    return { ok: false, error: err.message };
  }
});

ipcMain.on('screen-share:answer', (_e, { requestId, sourceId }) => {
  const resolve = pendingScreenShare.get(requestId);
  if (!resolve) return;
  pendingScreenShare.delete(requestId);
  resolve(sourceId || null);
});

app.whenReady().then(async () => {
  // Windows: required for native Notifications to render with the correct app
  // name + icon. Without this, Telegram/Discord/YouTube push notifications
  // either don't appear or show as "Electron".
  try { app.setAppUserModelId('com.chinazes.app'); } catch {}

  // Force dark color-scheme so embedded sites that respect prefers-color-scheme
  // (Gmail, Discord web, YouTube etc.) render in dark by default.
  try { nativeTheme.themeSource = 'dark'; } catch {}

  // Default session
  suppressSecurityPrompts(session.defaultSession);

  // Pre-create partition sessions so proxy state can be applied early.
  for (const partition of SERVICE_PARTITIONS) {
    const ses = session.fromPartition(partition);
    suppressSecurityPrompts(ses);
  }

  notes.init();
  notes.register();
  aiProvider.init();
  aiProvider.register();
  appsScanner.register();
  
  // Initialize AIRI modules
  const orchestrator = getOrchestrator();
  orchestrator.setMainWindow(mainWindow);
  orchestrator.setAIProvider(aiProvider);
  
  const telegramBridge = getTelegramBridge();
  telegramBridge.setOrchestratorCallback((data) => {
    // Forward to orchestrator
    orchestrator.processMessage(data);
  });
  
  // Register AIRI IPC handlers
  registerAIRIHandlers(orchestrator, telegramBridge);

  proxyManager.init({
    userDataDir: app.getPath('userData'),
    resourcesDir: app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, '../../resources'),
    onStateChange: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('proxy:state', state);
      }
      applyProxyToAllServiceSessions().catch(() => {});
    },
  });

  createWindow();

  updater.init({ window: mainWindow, logger: console });

  // Network speed monitor — emits {rxBps, txBps} every ~1s.
  netMonitor.start((sample) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('net:stats', sample);
    }
  }, console);
});

app.on('window-all-closed', async () => {
  await proxyManager.stop().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});

// --------- YouTube Mini Player ----------
function createYouTubeMiniPlayer(videoUrl) {
  if (youtubeMiniPlayer && !youtubeMiniPlayer.isDestroyed()) {
    youtubeMiniPlayer.focus();
    if (videoUrl) {
      youtubeMiniPlayer.webContents.loadURL(videoUrl);
    }
    return youtubeMiniPlayer;
  }

  youtubeMiniPlayer = new BrowserWindow({
    width: 560,
    height: 380,
    minWidth: 360,
    minHeight: 240,
    maxWidth: 1400,
    maxHeight: 1000,
    title: 'YouTube Mini Player',
    icon: path.join(__dirname, '../../resources/icon.ico'),
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    frame: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'miniplayer-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'persist:youtube',
    },
  });

  // Load YouTube with the current video URL or just YouTube
  const url = videoUrl || 'https://www.youtube.com/';
  youtubeMiniPlayer.loadURL(url);

  // Apply security/proxy settings
  const ses = youtubeMiniPlayer.webContents.session;
  suppressSecurityPrompts(ses);
  proxyManager.applyToSession(ses).catch(() => {});

  // Title bar is injected via miniplayer-preload.js
  // This is more reliable than executeJavaScript

  // Handle window drag events
  let dragStartPos = null;
  let isDragging = false;

  ipcMain.on('youtube-miniplayer:drag-start', () => {
    if (!youtubeMiniPlayer || youtubeMiniPlayer.isDestroyed()) return;
    // If maximized, restore before dragging (native Windows behavior)
    if (youtubeMiniPlayer.isMaximized()) youtubeMiniPlayer.unmaximize();
    dragStartPos = youtubeMiniPlayer.getPosition();
    isDragging = true;
  });

  ipcMain.on('youtube-miniplayer:drag-move', (_e, { deltaX, deltaY }) => {
    if (!isDragging || !dragStartPos || !youtubeMiniPlayer || youtubeMiniPlayer.isDestroyed()) return;
    const [x, y] = dragStartPos;
    youtubeMiniPlayer.setPosition(x + deltaX, y + deltaY);
  });

  ipcMain.on('youtube-miniplayer:drag-end', () => {
    isDragging = false;
    dragStartPos = null;
  });

  // ── Resize handlers ──
  let resizeStartSize = null;
  ipcMain.on('youtube-miniplayer:resize-start', () => {
    if (!youtubeMiniPlayer || youtubeMiniPlayer.isDestroyed()) return;
    if (youtubeMiniPlayer.isMaximized()) youtubeMiniPlayer.unmaximize();
    resizeStartSize = youtubeMiniPlayer.getSize();
  });
  ipcMain.on('youtube-miniplayer:resize-move', (_e, { dw, dh }) => {
    if (!resizeStartSize || !youtubeMiniPlayer || youtubeMiniPlayer.isDestroyed()) return;
    const [w, h] = resizeStartSize;
    const newW = Math.max(360, Math.min(1400, w + dw));
    const newH = Math.max(240, Math.min(1000, h + dh));
    youtubeMiniPlayer.setSize(newW, newH);
  });
  ipcMain.on('youtube-miniplayer:resize-end', () => {
    resizeStartSize = null;
  });

  ipcMain.on('youtube-miniplayer:toggle-maximize', () => {
    if (!youtubeMiniPlayer || youtubeMiniPlayer.isDestroyed()) return;
    if (youtubeMiniPlayer.isMaximized()) {
      youtubeMiniPlayer.unmaximize();
      // Restore to a reasonable default size
      youtubeMiniPlayer.setSize(560, 380);
    } else {
      youtubeMiniPlayer.maximize();
    }
  });

  ipcMain.on('youtube-miniplayer:minimize', () => {
    if (!youtubeMiniPlayer || youtubeMiniPlayer.isDestroyed()) return;
    youtubeMiniPlayer.minimize();
  });

  youtubeMiniPlayer.on('closed', () => {
    youtubeMiniPlayer = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    youtubeMiniPlayer.webContents.openDevTools({ mode: 'detach' });
  }

  return youtubeMiniPlayer;
}

function closeYouTubeMiniPlayer() {
  if (youtubeMiniPlayer && !youtubeMiniPlayer.isDestroyed()) {
    youtubeMiniPlayer.close();
    youtubeMiniPlayer = null;
  }
}

function isYouTubeMiniPlayerOpen() {
  return youtubeMiniPlayer && !youtubeMiniPlayer.isDestroyed();
}

// IPC handlers for YouTube mini player
ipcMain.handle('youtube-miniplayer:open', (_e, videoUrl) => {
  createYouTubeMiniPlayer(videoUrl);
  return { success: true };
});

ipcMain.handle('youtube-miniplayer:close', () => {
  closeYouTubeMiniPlayer();
  return { success: true };
});

ipcMain.handle('youtube-miniplayer:is-open', () => {
  return isYouTubeMiniPlayerOpen();
});

// Handle close request from mini player window itself
ipcMain.on('youtube-miniplayer:request-close', (_e) => {
  // Check if sender is the mini player window
  const senderWindow = BrowserWindow.fromWebContents(_e.sender);
  if (senderWindow === youtubeMiniPlayer) {
    closeYouTubeMiniPlayer();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  netMonitor.stop();
  await proxyManager.stop().catch(() => {});
});

// --------- IPC: app meta ----------
ipcMain.handle('app:get-version', () => app.getVersion());

// Apply a User-Agent to every service partition. Empty string -> default Chrome UA.
ipcMain.handle('app:set-user-agent', (_e, ua) => {
  const effective = ua && ua.trim() ? ua : DEFAULT_CHROME_UA;
  for (const partition of SERVICE_PARTITIONS) {
    const ses = session.fromPartition(partition);
    try { ses.setUserAgent(effective); } catch {}
  }
  // Also apply to default session (for renderer fetches and any future webviews).
  try { session.defaultSession.setUserAgent(effective); } catch {}
  return true;
});

// --------- IPC: window controls ----------
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// --------- IPC: proxy ----------
ipcMain.handle('proxy:get-state', () => proxyManager.getState());
ipcMain.handle('proxy:get-config', () => proxyManager.getStoredConfig());
ipcMain.handle('proxy:import-link', async (_e, input) => {
  return proxyManager.importLink(input);
});
ipcMain.handle('proxy:refresh-subscription', async () => {
  return proxyManager.refreshSubscription();
});
ipcMain.handle('proxy:probe-servers', async (_e, opts) => {
  return proxyManager.probeServers(opts || {});
});
ipcMain.handle('proxy:clear-xray', async () => {
  return proxyManager.clearXrayConfig();
});
ipcMain.handle('proxy:select-server', async (_e, index) => {
  return proxyManager.selectServer(index);
});
ipcMain.handle('proxy:set-engine', async (_e, engineId) => {
  return proxyManager.setEngine(engineId);
});
ipcMain.handle('proxy:connect', async () => {
  await proxyManager.start();
  await applyProxyToAllServiceSessions();
  return proxyManager.getState();
});
ipcMain.handle('proxy:disconnect', async () => {
  await proxyManager.stop();
  await applyProxyToAllServiceSessions();
  return proxyManager.getState();
});

// ---------- Zapret 2 panel ----------

const { execFile, spawn: childSpawn } = require('node:child_process');
const { promisify } = require('node:util');
const execFileP = promisify(execFile);

const ZapretEngineModule = require('./engines/zapret');
const _zapretEngineForDetect = new ZapretEngineModule.ZapretEngine({
  userDataDir: app.getPath('userData'),
  resourcesDir: process.resourcesPath || path.join(__dirname, '..', '..', 'resources'),
});

async function zapretStatus() {
  const [install, running] = await Promise.all([
    _zapretEngineForDetect.detectInstall(),
    _zapretEngineForDetect.detectRunning(),
  ]);
  // Worker = winws.exe / winws2.exe; GUI = Zapret.exe.
  const hasWorker = running.some((r) => /winws/i.test(r.name));
  const hasGui    = running.some((r) => /^Zapret\.exe$/i.test(r.name));
  return {
    installed:    !!install,
    installPath:  install?.installPath || null,
    version:      install?.version    || null,
    workerRunning: hasWorker,
    guiRunning:    hasGui,
    bypassActive:  hasWorker, // The actual DPI bypass is the worker
  };
}

ipcMain.handle('zapret-panel:status', () => zapretStatus());

ipcMain.handle('zapret-panel:open-gui', async () => {
  const info = await _zapretEngineForDetect.detectInstall();
  if (!info) throw new Error('Zapret 2 не установлен');
  // Use shell.openPath so Windows handles the requireAdministrator manifest via UAC.
  const exe = path.join(info.installPath, 'Zapret.exe');
  if (!fs.existsSync(exe)) throw new Error(`Zapret.exe не найден в ${info.installPath}`);
  const { shell } = require('electron');
  const err = await shell.openPath(exe);
  if (err) throw new Error(err);
  return { ok: true };
});

ipcMain.handle('zapret-panel:open-folder', async () => {
  const info = await _zapretEngineForDetect.detectInstall();
  if (!info) throw new Error('Zapret 2 не установлен');
  const { shell } = require('electron');
  await shell.openPath(info.installPath);
  return { ok: true };
});

ipcMain.handle('zapret-panel:test-connection', async () => {
  // Best-effort: probe a few known-blocked endpoints in RU.
  const targets = [
    { name: 'YouTube',  host: 'www.youtube.com', port: 443 },
    { name: 'Discord',  host: 'discord.com',     port: 443 },
    { name: 'Cloudflare', host: '1.1.1.1',       port: 443 },
  ];
  const net = require('node:net');
  const results = await Promise.all(targets.map((t) => new Promise((resolve) => {
    const s = new net.Socket();
    const start = Date.now();
    s.setTimeout(3000);
    s.once('connect', () => { s.destroy(); resolve({ ...t, ok: true,  ms: Date.now() - start }); });
    s.once('timeout', () => { s.destroy(); resolve({ ...t, ok: false, ms: null, error: 'timeout' }); });
    s.once('error',   (e) => { s.destroy(); resolve({ ...t, ok: false, ms: null, error: e.code || e.message }); });
    s.connect(t.port, t.host);
  })));
  return results;
});

// Cleanup on app quit
app.on('before-quit', () => {
  // Cleanup code here
});

// --------- AIRI Integration IPC Handlers ---------
function registerAIRIHandlers(orchestrator, telegramBridge) {
  const webSearch = getWebSearch();
  
  // Process message (from Discord/Telegram or voice chat)
  ipcMain.handle('airi:process-message', async (event, data) => {
    return await orchestrator.processMessage(data);
  });

  // Execute command (media, discord, telegram)
  ipcMain.handle('airi:execute-command', async (event, command) => {
    return await orchestrator.executeCommand(command);
  });

  // Web search
  ipcMain.handle('airi:web-search', async (event, query, openWindow) => {
    return await webSearch.explicitSearch(query, openWindow);
  });

  // Get user context/memory
  ipcMain.handle('airi:get-user-context', (event, platformId) => {
    const { getUserMemory } = require('./user-memory');
    return getUserMemory().getUserContext(platformId);
  });

  // Discord bot handlers
  let discordBotInstance = null;
  
  ipcMain.handle('airi:discord-connect', async (event, token) => {
    try {
      // Store token in environment for the bot
      process.env.DISCORD_TOKEN = token;
      
      // Dynamic import for ES module Discord bot (must specify file:// for Windows paths)
      const botPath = require('path').join(__dirname, '../../discord-bot/src/bot.js');
      const { default: discordBot } = await import('file://' + botPath);
      discordBotInstance = discordBot;
      
      // Set up bridge
      discordBot.setBridge({
        requestResponse: async (data) => {
          return await orchestrator.processMessage(data);
        },
        emit: (event, data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(`discord:${event}`, data);
          }
        },
      });
      
      const success = await discordBot.start();
      orchestrator.setDiscordBot(discordBot);
      return { success, status: discordBot.client?.user?.tag || 'connecting' };
    } catch (error) {
      console.error('[AIRI] Discord connect error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('airi:discord-disconnect', async () => {
    if (discordBotInstance) {
      await discordBotInstance.stop();
      discordBotInstance = null;
    }
    return { success: true };
  });

  ipcMain.handle('airi:discord-status', () => {
    if (!discordBotInstance?.client?.isReady()) {
      return { connected: false };
    }
    return {
      connected: true,
      tag: discordBotInstance.client.user.tag,
      guilds: discordBotInstance.client.guilds.cache.size,
      autoReplyChannels: discordBotInstance.autoReplyEnabled.size,
    };
  });

  // Telegram handlers
  ipcMain.handle('airi:telegram-toggle', (event, chatId, enabled) => {
    return telegramBridge.toggleAutoReply(chatId, enabled);
  });

  ipcMain.handle('airi:telegram-chats', async () => {
    return await telegramBridge.listChats();
  });

  // Media control - forward to webviews
  ipcMain.on('airi:media-control', (event, { service, action, ...params }) => {
    // Find the webview for this service and send command
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media:control', { service, action, ...params });
    }
    // Also send to YouTube window if it's open and this is a YouTube command
    if (youtubeWindow && !youtubeWindow.isDestroyed() && (service === 'youtube' || service === 'current')) {
      youtubeWindow.webContents.send('media:control', { service, action, ...params });
    }
  });

  // Service switching
  ipcMain.on('service:switch', (event, serviceId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service:switch', serviceId);
    }
  });

  // Open URL in service
  ipcMain.on('service:open-url', (event, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service:open-url', url);
    }
  });
}

