const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { XrayEngine } = require('./engines/xray');
const { WarpPlusEngine } = require('./engines/warp-plus');
const { PsiphonEngine } = require('./engines/psiphon');
const { parseShareLink, fetchSubscription, isSubscriptionUrl } = require('./link-parser');

let ctx = {
  userDataDir: null,
  resourcesDir: null,
  onStateChange: () => {},
};

let state = {
  status: 'disconnected', // disconnected | starting | connected | error
  message: '',
  engine: 'xray',         // xray | warp | psiphon
  server: null,           // meta of active server (xray only)
  socksPort: null,
  scope: 'app',
};

let engines = { xray: null, warp: null, psiphon: null };
let activeEngine = null;
let activeProxyRules = '';

// ---------- Config persistence ----------

function configPath() {
  return path.join(ctx.userDataDir, 'chinazes-config.json');
}

function getStoredConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {
      engine: 'warp',  // WARP+ is the recommended default — works out of the box in RU
      xray: { link: '', subscription: '', servers: [], selectedIndex: 0, meta: null },
      warp: {},
      psiphon: {},
    };
  }
}

function saveStoredConfig(cfg) {
  fs.mkdirSync(ctx.userDataDir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

// ---------- State ----------

function setState(patch) {
  state = { ...state, ...patch };
  try { ctx.onStateChange(state); } catch {}
}
function getState() { return state; }

// ---------- Init ----------

function init(options) {
  ctx = { ...ctx, ...options };
  engines.xray = new XrayEngine({
    userDataDir: ctx.userDataDir,
    resourcesDir: ctx.resourcesDir,
  });
  engines.warp = new WarpPlusEngine({
    resourcesDir: ctx.resourcesDir,
    userDataDir: ctx.userDataDir,
  });
  engines.psiphon = new PsiphonEngine({
    resourcesDir: ctx.resourcesDir,
    userDataDir: ctx.userDataDir,
  });

  const stored = getStoredConfig();
  // Migrate old engine ids: zapret/snowflake were removed. Fall back to warp.
  const engine = ['xray', 'warp', 'psiphon'].includes(stored.engine) ? stored.engine : 'warp';
  setState({ engine });
}

// ---------- Link / subscription flow ----------

async function importLink(input) {
  // Accepts: single share link, OR http(s) subscription URL, OR raw list separated by newlines.
  const trimmed = (input || '').trim();
  if (!trimmed) throw new Error('Empty input');

  const cfg = getStoredConfig();

  if (isSubscriptionUrl(trimmed)) {
    const servers = await fetchSubscription(trimmed);
    cfg.xray.subscription = trimmed;
    cfg.xray.servers = servers;
    cfg.xray.selectedIndex = 0;
    cfg.xray.link = servers[0].link;
    cfg.xray.meta = servers[0].meta;
    saveStoredConfig(cfg);
    return { kind: 'subscription', servers, selectedIndex: 0 };
  }

  // Maybe a multi-line paste of raw share links
  const maybeLines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(vless|vmess|trojan|ss|hysteria2|hy2):\/\//i.test(l));

  if (maybeLines.length > 1) {
    const servers = [];
    for (const line of maybeLines) {
      try {
        const { meta } = parseShareLink(line);
        servers.push({ link: line, meta });
      } catch { /* skip */ }
    }
    if (!servers.length) throw new Error('No valid share links in list');
    cfg.xray.subscription = '';
    cfg.xray.servers = servers;
    cfg.xray.selectedIndex = 0;
    cfg.xray.link = servers[0].link;
    cfg.xray.meta = servers[0].meta;
    saveStoredConfig(cfg);
    return { kind: 'list', servers, selectedIndex: 0 };
  }

  // Single share link
  const { meta } = parseShareLink(trimmed);
  cfg.xray.subscription = '';
  cfg.xray.servers = [{ link: trimmed, meta }];
  cfg.xray.selectedIndex = 0;
  cfg.xray.link = trimmed;
  cfg.xray.meta = meta;
  saveStoredConfig(cfg);
  return { kind: 'single', servers: cfg.xray.servers, selectedIndex: 0 };
}

async function refreshSubscription() {
  const cfg = getStoredConfig();
  if (!cfg.xray.subscription) throw new Error('No subscription URL stored');
  const servers = await fetchSubscription(cfg.xray.subscription);
  cfg.xray.servers = servers;
  if (cfg.xray.selectedIndex >= servers.length) cfg.xray.selectedIndex = 0;
  cfg.xray.link = servers[cfg.xray.selectedIndex].link;
  cfg.xray.meta = servers[cfg.xray.selectedIndex].meta;
  saveStoredConfig(cfg);
  return { servers, selectedIndex: cfg.xray.selectedIndex };
}

function selectServer(index) {
  const cfg = getStoredConfig();
  const servers = cfg.xray.servers || [];
  if (index < 0 || index >= servers.length) throw new Error('Index out of range');
  cfg.xray.selectedIndex = index;
  cfg.xray.link = servers[index].link;
  cfg.xray.meta = servers[index].meta;
  saveStoredConfig(cfg);
  return cfg.xray;
}

function clearXrayConfig() {
  const cfg = getStoredConfig();
  cfg.xray = { link: '', subscription: '', servers: [], selectedIndex: 0, meta: null };
  saveStoredConfig(cfg);
  return cfg.xray;
}

function setEngine(engine) {
  if (!['xray', 'warp', 'psiphon'].includes(engine)) throw new Error('Unknown engine');
  const cfg = getStoredConfig();
  cfg.engine = engine;
  saveStoredConfig(cfg);
  setState({ engine });
  return engine;
}

// ---------- Lifecycle ----------

async function start() {
  await stop(); // ensure clean state between switches

  const cfg = getStoredConfig();
  const engineId = cfg.engine || 'xray';
  const engine = engines[engineId];
  if (!engine) throw new Error(`Unknown engine: ${engineId}`);

  setState({ status: 'starting', message: '', engine: engineId });

  try {
    let result;
    if (engineId === 'xray') {
      const link = cfg.xray?.link;
      if (!link) throw new Error('No server configured. Paste a link or subscription first.');
      result = await engine.start({ link });
      setState({
        status: 'connected',
        engine: 'xray',
        scope: 'app',
        server: cfg.xray.meta || null,
        socksPort: result.socksPort,
        message: '',
      });
    } else if (engineId === 'warp') {
      result = await engine.start();
      setState({
        status: 'connected',
        engine: 'warp',
        scope: 'app',
        server: { name: 'WARP+ (auto-scanner)', protocol: 'warp+' },
        socksPort: result.socksPort,
        message: 'WARP+ via warp-plus — endpoint scanner + AmneziaWG obfuscation',
      });
    } else if (engineId === 'psiphon') {
      result = await engine.start();
      setState({
        status: 'connected',
        engine: 'psiphon',
        scope: 'app',
        server: { name: 'Psiphon tunnel', protocol: 'psiphon' },
        socksPort: 1099,
        message: 'Psiphon — auto-discovered tunnel, app-scoped',
      });
    }

    activeEngine = engine;
    activeProxyRules = result?.proxyRules || '';
  } catch (e) {
    setState({ status: 'error', message: e.message || String(e) });
    throw e;
  }
}

async function stop() {
  if (activeEngine) {
    try { await activeEngine.stop(); } catch {}
  }
  activeEngine = null;
  activeProxyRules = '';
  setState({ status: 'disconnected', server: null, message: '', socksPort: null, scope: 'app' });
}

// ---------- Electron session glue ----------

// TCP probe: connect to host:port with timeout, return latency in ms or null.
function probeServer(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (latency) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(latency);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(Date.now() - start));
    socket.once('timeout', () => finish(null));
    socket.once('error',   () => finish(null));
    try { socket.connect(port, host); } catch { finish(null); }
  });
}

// Probe servers in parallel batches. Returns array indexed by `servers` (null = unreachable / skipped).
// If `indices` is provided, only those positions are tested; others stay null.
async function probeServers({ concurrency = 20, timeoutMs = 3000, indices = null } = {}) {
  const cfg = getStoredConfig();
  const servers = cfg.xray?.servers || [];
  if (!servers.length) return [];

  const targets = indices && indices.length ? indices : servers.map((_, i) => i);
  const results = new Array(servers.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const i = targets[cursor++];
      const meta = servers[i]?.meta || {};
      const host = meta.address || meta.host;
      const port = Number(meta.port);
      if (!host || !port) continue;
      results[i] = await probeServer(host, port, timeoutMs);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function applyToSession(ses) {
  if (!ses) return;
  if (activeProxyRules) {
    await ses.setProxy({ proxyRules: activeProxyRules, proxyBypassRules: '<local>' });
  } else {
    await ses.setProxy({ proxyRules: '' });
  }
}

module.exports = {
  init,
  getState,
  getStoredConfig,
  importLink,
  refreshSubscription,
  probeServers,
  clearXrayConfig,
  selectServer,
  setEngine,
  start,
  stop,
  applyToSession,
};
