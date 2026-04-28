
const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

let mainWindow = null;
let lastInfo = null;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function send(channel, payload) {
  try { mainWindow?.webContents?.send(channel, payload); } catch {}
}

function attachLogging(logger) {
  autoUpdater.logger = logger;
  autoUpdater.on('checking-for-update', () => logger.log('[updater] checking…'));
  autoUpdater.on('update-available',   (i) => { lastInfo = i; logger.log('[updater] available', i?.version); send('updater:available', i); });
  autoUpdater.on('update-not-available', (i) => { logger.log('[updater] up to date', i?.version); send('updater:none', i); });
  autoUpdater.on('error',              (e) => { logger.error('[updater] error', e?.message); send('updater:error', String(e?.message || e)); });
  autoUpdater.on('download-progress',  (p) => send('updater:progress', { percent: p.percent, transferred: p.transferred, total: p.total }));
  autoUpdater.on('update-downloaded',  (i) => { lastInfo = i; logger.log('[updater] downloaded', i?.version); send('updater:downloaded', i); });
}

function init({ window, logger = console }) {
  mainWindow = window;
  attachLogging(logger);

  // Skip in dev (electron-updater needs a packaged build with metadata)
  if (process.env.NODE_ENV === 'development') {
    logger.log('[updater] skipped (dev mode)');
    return;
  }

  ipcMain.handle('updater:check', async () => {
    try { return await autoUpdater.checkForUpdates(); }
    catch (e) { return { error: String(e?.message || e) }; }
  });
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.handle('updater:state', () => lastInfo);

  // Run a check ~3s after launch to avoid slowing startup.
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((e) =>
      logger.error('[updater] check failed', e?.message)
    );
  }, 3000);
}

module.exports = { init };
