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
const netMonitor = require('./net-monitor');

let mainWindow;

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

  // Re-apply current proxy state to every webview session that gets created.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      proxyManager.applyToSession(contents.session);
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
const DEFAULT_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function suppressSecurityPrompts(ses) {
  // Apply Chrome-like UA *before* the first webview navigates.
  try { ses.setUserAgent(DEFAULT_CHROME_UA); } catch {}
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
  ses.setPermissionCheckHandler((_wc, perm) => {
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

