// Scans the local Windows machine for installed apps and games and exposes them
// to the renderer. Strategy:
//   • Uninstall registry: HKLM/HKCU x86/x64 — covers most desktop apps
//   • Steam: parse libraryfolders.vdf + appmanifest_*.acf
//   • Start Menu .lnk shortcuts: %APPDATA% and %PROGRAMDATA% Programs trees
// Icons are extracted via app.getFileIcon(path) and cached as data URLs.
// Results + icons are persisted to userData/apps-cache.json so a fresh scan
// only happens on demand.

const { app, ipcMain, shell, nativeImage, dialog, BrowserWindow } = require('electron');
const { execFile, spawn } = require('child_process');
const fs   = require('fs');
const fsp  = fs.promises;
const path = require('path');
const os   = require('os');

const CACHE_FILE   = () => path.join(app.getPath('userData'), 'apps-cache.json');
const FOLDERS_FILE = () => path.join(app.getPath('userData'), 'app-folders.json');
const ICON_DIR     = () => path.join(app.getPath('userData'), 'app-icons');

// -------------------- helpers --------------------
function regQuery(keyPath) {
  return new Promise((resolve) => {
    execFile('reg', ['query', keyPath, '/s', '/reg:64'], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve('');
      resolve(stdout || '');
    });
  });
}

// Parse `reg query` output into an array of { keyPath, values: { name: { type, data } } }.
function parseRegOutput(text) {
  const blocks = text.split(/\r?\n\r?\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (!lines.length) continue;
    const keyLine = lines[0];
    if (!keyLine || !keyLine.startsWith('HK')) continue;
    const values = {};
    for (let i = 1; i < lines.length; i++) {
      // 4-space indent + name + 4-space indent + type + 4-space indent + data
      const m = lines[i].match(/^\s{4}(.*?)\s{2,}(REG_\w+)\s{2,}(.*)$/);
      if (!m) continue;
      values[m[1]] = { type: m[2], data: m[3] };
    }
    out.push({ keyPath: keyLine.trim(), values });
  }
  return out;
}

async function scanRegistryUninstall() {
  const roots = [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const results = [];
  for (const r of roots) {
    const text = await regQuery(r);
    if (!text) continue;
    const blocks = parseRegOutput(text);
    for (const b of blocks) {
      const v = b.values;
      const name = v.DisplayName?.data;
      if (!name) continue;
      // Skip system updates / hotfixes / drivers.
      if (/^(KB\d+|Update for|Security Update|Driver|Microsoft \.NET)/i.test(name)) continue;
      if (v.SystemComponent?.data === '0x1') continue;
      const installLocation = (v.InstallLocation?.data || '').replace(/^"|"$/g, '');
      const displayIcon     = (v.DisplayIcon?.data || '').split(',')[0].replace(/^"|"$/g, '');
      // Discover an .exe to launch with: prefer DisplayIcon if it's exe, else
      // scan installLocation for the most likely top-level .exe.
      let launchPath = '';
      if (displayIcon && /\.exe$/i.test(displayIcon) && fs.existsSync(displayIcon)) {
        launchPath = displayIcon;
      } else if (installLocation && fs.existsSync(installLocation)) {
        try {
          const files = fs.readdirSync(installLocation);
          const exe = files.find((f) => /\.exe$/i.test(f) && !/unins|setup|update/i.test(f));
          if (exe) launchPath = path.join(installLocation, exe);
        } catch {}
      }
      if (!launchPath) continue;
      results.push({
        id: 'reg:' + Buffer.from(launchPath).toString('base64').slice(0, 32),
        name,
        path: launchPath,
        source: 'registry',
        publisher: v.Publisher?.data || '',
      });
    }
  }
  return dedupeByPath(results);
}

// -------------------- Steam --------------------
function unescapeVDF(s) {
  // VDF stores paths as "D:\\SteamLibrary" — literal double backslash that
  // must be unescaped to a single backslash before fs APIs accept the path.
  // Also handles \" and \n / \t escapes that VDF supports.
  return s.replace(/\\(.)/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    return c; // \\ → \,  \" → "
  });
}

function parseVDF(text) {
  // VDF parser - handles nested {} blocks, quoted keys/values, and unquoted numbers
  // Tokenize first, then parse
  const tokens = [];
  const tokenRe = /"([^"\\]*(?:\\.[^"\\]*)*)"|\{|\}|(\d+)/g;
  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m[1] !== undefined) {
      tokens.push({ type: 'string', value: unescapeVDF(m[1]) });
    } else if (m[0] === '{') {
      tokens.push({ type: 'open' });
    } else if (m[0] === '}') {
      tokens.push({ type: 'close' });
    } else if (m[2] !== undefined) {
      tokens.push({ type: 'number', value: m[2] });
    }
  }

  // Parse tokens into nested objects
  let pos = 0;
  function parseObject() {
    const obj = {};
    while (pos < tokens.length) {
      const token = tokens[pos];
      if (token.type === 'close') {
        pos++;
        return obj;
      }
      if (token.type === 'open') {
        // Shouldn't happen at object start, skip
        pos++;
        continue;
      }
      // Get key (string or number)
      let key;
      if (token.type === 'string' || token.type === 'number') {
        key = token.value;
        pos++;
      } else {
        pos++;
        continue;
      }
      
      if (pos >= tokens.length) break;
      
      const valToken = tokens[pos];
      if (valToken.type === 'open') {
        pos++;
        obj[key] = parseObject();
      } else if (valToken.type === 'string' || valToken.type === 'number') {
        obj[key] = valToken.value;
        pos++;
      } else {
        pos++;
      }
    }
    return obj;
  }
  
  return parseObject();
}

async function findSteamRoot() {
  // 1) Registry — Steam writes its install path on every install/update.
  const regKeys = [
    'HKCU\\Software\\Valve\\Steam',
    'HKLM\\Software\\WOW6432Node\\Valve\\Steam',
    'HKLM\\Software\\Valve\\Steam',
  ];
  for (const k of regKeys) {
    const out = await regQuery(k);
    if (!out) continue;
    // Look for SteamPath or InstallPath REG_SZ. Use [^\r\n] to exclude Windows
    // CR which `.+` would otherwise capture and corrupt the path.
    const m = out.match(/(?:SteamPath|InstallPath)\s+REG_SZ\s+([^\r\n]+)/i);
    if (m) {
      const p = m[1].trim().replace(/\//g, '\\').replace(/[\\]+$/, '');
      try {
        if (fs.existsSync(path.join(p, 'steam.exe'))) return p;
      } catch {}
    }
  }
  // 2) Common install dirs across all drive letters (A:..Z:).
  const subPaths = [
    'Program Files (x86)\\Steam',
    'Program Files\\Steam',
    'Steam',
    'Games\\Steam',
    'SteamLibrary',
  ];
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const drive = String.fromCharCode(code) + ':\\';
    if (!fs.existsSync(drive)) continue;
    for (const sub of subPaths) {
      const candidate = path.join(drive, sub);
      try {
        if (fs.existsSync(path.join(candidate, 'steam.exe'))) return candidate;
      } catch {}
    }
  }
  // 3) User profile fallback (legacy).
  const home = path.join(os.homedir(), 'Steam');
  if (fs.existsSync(path.join(home, 'steam.exe'))) return home;
  return '';
}

async function scanSteam() {
  const steamRoot = await findSteamRoot();
  console.log(`[SteamScan] Steam root: ${steamRoot || 'NOT FOUND'}`);
  if (!steamRoot) return [];

  // Library folders.
  const libFile = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  const libs = [path.join(steamRoot, 'steamapps')];
  console.log(`[SteamScan] Reading libraryfolders.vdf: ${libFile}`);
  try {
    const txt = await fsp.readFile(libFile, 'utf8');
    console.log(`[SteamScan] libraryfolders.vdf size: ${txt.length} chars`);
    const v = parseVDF(txt);
    console.log(`[SteamScan] Parsed VDF keys: ${Object.keys(v).join(', ')}`);
    const lf = v.libraryfolders || v.LibraryFolders || {};
    console.log(`[SteamScan] libraryfolders entries: ${Object.keys(lf).length}`);
    for (const key of Object.keys(lf)) {
      const entry = lf[key];
      console.log(`[SteamScan] Entry ${key}: ${JSON.stringify(entry).slice(0, 100)}`);
      if (entry && typeof entry === 'object' && entry.path) {
        const normalizedPath = entry.path.replace(/\//g, '\\');
        libs.push(path.join(normalizedPath, 'steamapps'));
      } else if (typeof entry === 'string' && /^[A-Z]:/i.test(entry)) {
        const normalizedPath = entry.replace(/\//g, '\\');
        libs.push(path.join(normalizedPath, 'steamapps'));
      }
    }
    console.log(`[SteamScan] Found libraries: ${libs.join(', ')}`);
  } catch (e) {
    console.warn(`[SteamScan] Error reading libraryfolders.vdf: ${e.message}`);
  }

  // Deduplicate library paths (case-insensitive on Windows)
  const seenPaths = new Set();
  const uniqueLibs = [];
  for (const lib of libs) {
    const lower = lib.toLowerCase();
    if (!seenPaths.has(lower)) {
      seenPaths.add(lower);
      uniqueLibs.push(lib);
    }
  }

  // Auto-discover additional libraries on all drives (D:, E:, F:, etc.)
  const steamLibraryNames = ['SteamLibrary', 'Steam Library', 'Steam', 'Games', 'Games\\Steam'];
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const drive = String.fromCharCode(code) + ':\\';
    if (!fs.existsSync(drive)) continue;
    for (const name of steamLibraryNames) {
      const candidate = path.join(drive, name, 'steamapps');
      const lower = candidate.toLowerCase();
      if (!seenPaths.has(lower) && fs.existsSync(candidate)) {
        // Verify it's a real Steam library by checking for appmanifest files
        try {
          const files = fs.readdirSync(candidate);
          if (files.some(f => /^appmanifest_\d+\.acf$/.test(f))) {
            seenPaths.add(lower);
            uniqueLibs.push(candidate);
            console.log(`[SteamScan] Auto-discovered library: ${candidate}`);
          }
        } catch {}
      }
    }
  }

  const existingLibs = [];
  for (const lib of uniqueLibs) {
    try {
      if (fs.existsSync(lib)) {
        existingLibs.push(lib);
      } else {
        console.warn(`[SteamScan] Library path does not exist: ${lib}`);
      }
    } catch (e) {
      console.warn(`[SteamScan] Error checking lib path ${lib}: ${e.message}`);
    }
  }
  console.log(`[SteamScan] Existing libraries to scan: ${existingLibs.join(', ')}`);

  const games = [];
  let skippedNoAppState = 0;
  let skippedNoAppId = 0;
  let manifestCount = 0;
  for (const lib of existingLibs) {
    console.log(`[SteamScan] Scanning lib: ${lib}`);
    try {
      const files = await fsp.readdir(lib);
      const manifests = files.filter(f => /^appmanifest_\d+\.acf$/.test(f));
      console.log(`[SteamScan] Found ${manifests.length} manifests in ${lib}`);
      for (const f of manifests) {
        manifestCount++;
        try {
          const txt = await fsp.readFile(path.join(lib, f), 'utf8');
          const v = parseVDF(txt);
          const app = v.AppState || v.appstate;
          if (!app) {
            skippedNoAppState++;
            console.warn(`[SteamScan] No AppState in ${f}, keys: ${Object.keys(v).join(',')}`);
            continue;
          }
          const appid = app.appid;
          const name  = app.name;
          if (!appid) {
            skippedNoAppId++;
            console.warn(`[SteamScan] No appid in ${f}: keys=${Object.keys(app).join(',')}`);
            continue;
          }
          // Fallback to "App {appid}" if name is missing (some DLC/tools don't have names)
          const displayName = name || `App ${appid}`;
          games.push({
            id: 'steam:' + appid,
            name: displayName,
            steamAppId: String(appid),
            path: '', // launched via steam:// URL
            source: 'steam',
            // Steam CDN library capsule — works without auth, served by Akamai/Cloudflare.
            icon: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
          });
        } catch (e) {
          console.warn(`[SteamScan] Error parsing ${f}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[SteamScan] Error reading lib ${lib}: ${e.message}`);
    }
  }
  console.log(`[SteamScan] Total manifests processed: ${manifestCount}, games found: ${games.length}, skipped: noAppState=${skippedNoAppState}, noAppId=${skippedNoAppId}`);
  return games;
}

// -------------------- Start Menu --------------------
async function scanStartMenu() {
  const dirs = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs'),
    process.env.PROGRAMDATA && path.join(process.env.PROGRAMDATA, 'Microsoft\\Windows\\Start Menu\\Programs'),
  ].filter(Boolean);

  const out = [];
  for (const d of dirs) {
    await walkLnk(d, out);
  }
  return out;
}

async function walkLnk(dir, out, depth = 0) {
  if (depth > 5) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkLnk(p, out, depth + 1);
    } else if (e.isFile() && /\.lnk$/i.test(e.name)) {
      const name = e.name.replace(/\.lnk$/i, '');
      // Skip "Uninstall …" / "Visit …" / "Read me" cruft.
      if (/^(uninstall |readme|visit |help |license)/i.test(name)) continue;
      out.push({
        id: 'lnk:' + Buffer.from(p).toString('base64').slice(0, 32),
        name,
        path: p,
        source: 'startmenu',
      });
    }
  }
}

// -------------------- icon extraction --------------------
async function ensureIconDir() {
  await fsp.mkdir(ICON_DIR(), { recursive: true }).catch(() => {});
}

async function getIconForApp(appItem) {
  const targetPath = appItem.path;
  if (!targetPath) return '';
  try {
    const img = await app.getFileIcon(targetPath, { size: 'large' });
    if (img.isEmpty()) return '';
    const buf = img.toPNG();
    await ensureIconDir();
    const file = path.join(ICON_DIR(), appItem.id.replace(/[^a-z0-9_:-]/gi, '_') + '.png');
    await fsp.writeFile(file, buf);
    return 'file://' + file.replace(/\\/g, '/');
  } catch {
    return '';
  }
}

// -------------------- main scan --------------------
function dedupeByPath(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const k = (a.path || a.id).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

async function scanAll(progressCb) {
  const send = (p) => { try { progressCb?.(p); } catch {} };
  send({ phase: 'steam' });
  const steam = await scanSteam();

  // Preserve manual entries across rescans.
  const prev = await loadCache();
  const manuals = (prev?.apps || []).filter((a) => a.source === 'manual');

  const all = dedupeByPath([...steam, ...manuals]);

  send({ phase: 'icons', total: all.length });
  let i = 0;
  for (const a of all) {
    // Steam tiles already carry a CDN URL; only manuals need local extraction.
    if (!a.icon && a.path) a.icon = await getIconForApp(a);
    i++;
    if (i % 10 === 0) send({ phase: 'icons', done: i, total: all.length });
  }
  return all;
}

async function loadCache() {
  try { return JSON.parse(await fsp.readFile(CACHE_FILE(), 'utf8')); }
  catch { return null; }
}
async function saveCache(data) {
  try { await fsp.writeFile(CACHE_FILE(), JSON.stringify(data)); } catch {}
}
async function loadFolders() {
  try { return JSON.parse(await fsp.readFile(FOLDERS_FILE(), 'utf8')); }
  catch { return []; }
}
async function saveFolders(arr) {
  try { await fsp.writeFile(FOLDERS_FILE(), JSON.stringify(arr)); } catch {}
}

// -------------------- launch --------------------
function launchApp(item) {
  if (!item) return false;
  if (item.source === 'steam' && item.steamAppId) {
    shell.openExternal(`steam://rungameid/${item.steamAppId}`);
    return true;
  }
  if (!item.path) return false;
  if (!fs.existsSync(item.path)) return false;
  // .lnk / .url -> shell handles them.
  if (/\.(lnk|url)$/i.test(item.path)) {
    shell.openPath(item.path);
    return true;
  }
  // .exe / others -> spawn detached so we don't keep parenting it.
  try {
    spawn(item.path, [], { detached: true, stdio: 'ignore', cwd: path.dirname(item.path) }).unref();
    return true;
  } catch {
    shell.openPath(item.path);
    return true;
  }
}

async function addManualApp({ name, filePath }) {
  if (!filePath) return null;
  const cleanPath = filePath.replace(/^"|"$/g, '');
  if (!fs.existsSync(cleanPath)) return null;
  const guessedName = (name || path.basename(cleanPath).replace(/\.(exe|lnk|url|bat|cmd)$/i, '')).trim();
  const item = {
    id: 'manual:' + Buffer.from(cleanPath).toString('base64').slice(0, 32),
    name: guessedName || 'App',
    path: cleanPath,
    source: 'manual',
  };
  item.icon = await getIconForApp(item);

  const cur = (await loadCache()) || { apps: [], scannedAt: 0 };
  // Replace if already exists (same path).
  const apps = cur.apps.filter((a) => a.id !== item.id && a.path?.toLowerCase() !== cleanPath.toLowerCase());
  apps.push(item);
  await saveCache({ apps, scannedAt: cur.scannedAt || Date.now() });
  return item;
}

async function removeApp(id) {
  const cur = await loadCache();
  if (!cur) return false;
  const apps = cur.apps.filter((a) => a.id !== id);
  await saveCache({ apps, scannedAt: cur.scannedAt });
  // Also unlink any folders.
  const folders = await loadFolders();
  const next = folders.map((f) => ({ ...f, appIds: f.appIds.filter((x) => x !== id) }));
  await saveFolders(next);
  return true;
}

// -------------------- IPC --------------------
function register() {
  ipcMain.handle('apps:list', async () => {
    const cur = (await loadCache()) || { apps: [], scannedAt: 0 };
    let dirty = false;
    // Migrate from v1.12.0: drop registry/startmenu entries (now Steam-only auto-scan).
    const before = cur.apps.length;
    const filtered = cur.apps.filter((a) => a.source === 'steam' || a.source === 'manual');
    if (filtered.length !== before) dirty = true;
    // Migrate from v1.13.0: backfill Steam CDN icons for entries that lack one.
    for (const a of filtered) {
      if (a.source === 'steam' && a.steamAppId && !a.icon) {
        a.icon = `https://cdn.cloudflare.steamstatic.com/steam/apps/${a.steamAppId}/header.jpg`;
        dirty = true;
      }
    }
    if (dirty) {
      await saveCache({ apps: filtered, scannedAt: cur.scannedAt });
      return { apps: filtered, scannedAt: cur.scannedAt };
    }
    return cur;
  });
  ipcMain.handle('apps:scan', async (e) => {
    const apps = await scanAll((p) => { try { e.sender.send('apps:scan-progress', p); } catch {} });
    const data = { apps, scannedAt: Date.now() };
    await saveCache(data);
    return data;
  });
  ipcMain.handle('apps:launch', async (_e, id) => {
    const cache = await loadCache();
    const item = cache?.apps?.find((a) => a.id === id);
    return launchApp(item);
  });
  ipcMain.handle('apps:folders:get', async () => loadFolders());
  ipcMain.handle('apps:folders:set', async (_e, arr) => { await saveFolders(arr); return true; });

  ipcMain.handle('apps:add-manual', async (e, payload) => {
    return addManualApp(payload || {});
  });
  ipcMain.handle('apps:remove', async (_e, id) => removeApp(id));
  ipcMain.handle('apps:pick-file', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, {
      title: 'Выбери исполняемый файл или ярлык',
      properties: ['openFile'],
      filters: [
        { name: 'Apps & Games', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths?.[0]) return null;
    return r.filePaths[0];
  });
}

module.exports = { register };
