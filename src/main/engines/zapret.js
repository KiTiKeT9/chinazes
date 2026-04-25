const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Zapret Windows port (winws.exe + WinDivert). Project: https://github.com/bol-van/zapret2
//
// IMPORTANT: zapret works system-wide via WinDivert packet driver.
// It CANNOT be scoped to a single application. It does, however, only
// touch TCP traffic on its configured filter (default: 80/443 to a list
// of slowed domains), so other traffic is unaffected.
//
// Requires admin privileges. The app itself must be launched as admin.

class ZapretEngine {
  constructor({ resourcesDir, logger } = {}) {
    this.resourcesDir = resourcesDir;
    this.logger = logger || console;
    this.process = null;
    this.id = 'zapret';
    this.strategy = 'builtin';
  }

  setStrategy(name) {
    this.strategy = name || 'builtin';
  }

  // List available .txt strategies in resources/zapret/bat/.
  listStrategies() {
    const dir = path.join(this.root, 'bat');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => /\.txt$/i.test(f))
      .sort((a, b) => a.localeCompare(b));
  }

  get root() {
    return path.join(this.resourcesDir, 'zapret');
  }

  // Recursively find winws*.exe (handles winws.exe / winws2.exe and arbitrary subdirs).
  findWinwsBinary() {
    const root = this.root;
    if (!fs.existsSync(root)) return null;

    // Prefer well-known dirs across Zapret distributions.
    const preferred = [
      path.join(root, 'exe'),                          // Zapret2 GUI (Windows installer)
      path.join(root, 'binaries', 'windows-x86_64'),   // zapret-win-bundle
      path.join(root, 'binaries', 'win64'),
      path.join(root, 'binaries', 'windows-x86'),
      path.join(root, 'binaries', 'win32'),
      root,
    ];
    for (const dir of preferred) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      const hit = entries.find((f) => /^winws\d*\.exe$/i.test(f));
      if (hit) return path.join(dir, hit);
    }
    // Fallback: walk a couple levels deep
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile() && /^winws\d*\.exe$/i.test(e.name)) return full;
        if (e.isDirectory() && stack.length < 50) stack.push(full);
      }
    }
    return null;
  }

  get winwsPath() {
    if (!this._cachedBinary) this._cachedBinary = this.findWinwsBinary();
    return this._cachedBinary;
  }

  // Parse a Zapret2 strategy file (.txt) into a winws argv list.
  // Format: blank lines separate strategy blocks; winws expects them joined with `--new`.
  parseStrategyFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const blocks = raw
      .replace(/\r/g, '')
      .split(/\n\s*\n+/)             // split on blank lines
      .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean).join(' ').trim())
      .filter(Boolean);

    const args = [];
    blocks.forEach((b, i) => {
      if (i > 0) args.push('--new');
      // Tokenize, respecting double-quoted segments.
      const tokens = b.match(/"[^"]*"|\S+/g) || [];
      for (const t of tokens) {
        args.push(t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t);
      }
    });
    return args;
  }

  // Default arg set. Strategy preference order:
  //   1. resources/zapret/args.txt                (raw user-supplied flags)
  //   2. resources/zapret/bat/<file>.txt          (Zapret2 GUI strategy, parsed) — opt-in via STRATEGY env var
  //   3. inline minimal "general" strategy        (default, known-good)
  defaultArgs() {
    const argsFile = path.join(this.root, 'args.txt');
    if (fs.existsSync(argsFile)) {
      const raw = fs.readFileSync(argsFile, 'utf8').trim();
      return raw.split(/\s+/).filter(Boolean);
    }

    // Pick a Zapret2 .txt strategy by name via instance prop or env var.
    const stratName = this.strategy || process.env.CHINAZES_ZAPRET_STRATEGY;
    if (stratName && stratName !== 'builtin') {
      const full = path.join(this.root, 'bat', stratName);
      if (fs.existsSync(full)) {
        try {
          const parsed = this.parseStrategyFile(full);
          if (parsed.length) return parsed;
        } catch (e) {
          this.logger.error('[zapret] strategy parse failed', stratName, e?.message);
        }
      } else {
        this.logger.error('[zapret] strategy not found:', stratName);
      }
    }

    // Inline minimal strategy: works for YouTube/Discord/general HTTPS DPI bypass.
    // Uses fake+split with md5sig fooling — robust on most RU ISPs.
    return [
      '--wf-tcp=80,443',
      '--wf-udp=443,50000-65535',
      '--filter-tcp=80,443',
      '--dpi-desync=fake,multisplit',
      '--dpi-desync-split-pos=1',
      '--dpi-desync-fooling=md5sig',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-udp=443',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
      '--new',
      '--filter-udp=50000-65535',
      '--filter-l7=discord,stun',
      '--dpi-desync=fake',
      '--dpi-desync-repeats=6',
    ];
  }

  isRunning() {
    return this.process && !this.process.killed && this.process.exitCode === null;
  }

  isAdmin() {
    // Cheap heuristic on Windows: try to read a protected path.
    // Electron exposes no reliable API for this without native modules, so
    // we just return true and let winws.exe fail loudly if not admin.
    return true;
  }

  async checkAvailable() {
    const bin = this.winwsPath;
    if (!bin || !fs.existsSync(bin)) {
      throw new Error(
        `winws.exe not found under ${this.root}. Extract bol-van/zapret2 Windows release there.`
      );
    }
  }

  // Copy lists/* into bin/ so winws (running with cwd=bin) can resolve
  // both .bin payloads AND hostlist/ipset txt files referenced by strategies.
  syncListsToBin() {
    const binDir = path.join(this.root, 'bin');
    const listsDir = path.join(this.root, 'lists');
    if (!fs.existsSync(binDir) || !fs.existsSync(listsDir)) return;
    try {
      const files = fs.readdirSync(listsDir);
      for (const name of files) {
        const src = path.join(listsDir, name);
        const dst = path.join(binDir, name);
        if (!fs.existsSync(dst)) {
          try { fs.copyFileSync(src, dst); } catch { /* skip */ }
        }
        // Strategies reference both `<name>.txt` and `list-<name>.txt`.
        // Create the alias if only one variant exists.
        if (/^[^.][^-]/.test(name) && !name.startsWith('list-') && !name.startsWith('ipset-')) {
          const alias = path.join(binDir, `list-${name}`);
          if (!fs.existsSync(alias)) {
            try { fs.copyFileSync(src, alias); } catch { /* skip */ }
          }
        }
      }
    } catch (e) {
      this.logger.error('[zapret] syncListsToBin failed:', e?.message);
    }
  }

  async start() {
    if (this.isRunning()) return { proxyRules: '' };
    await this.checkAvailable();

    const bin = this.winwsPath;
    const args = this.defaultArgs();

    // winws strategy files reference .bin payloads (quic_initial_*.bin, tls_clienthello_*.bin)
    // by bare filename. Those live in resources/zapret/bin/. Set cwd there so they resolve.
    const binDir = path.join(this.root, 'bin');
    const cwd = fs.existsSync(binDir) ? binDir : path.dirname(bin);

    // Copy hostlists/ipsets next to .bin payloads so winws finds them with cwd=bin/.
    this.syncListsToBin();

    this.logger.log('[zapret] spawn', bin, 'cwd=', cwd, 'args=', args.join(' '));

    let lastStderr = '';
    let lastStdout = '';

    this.process = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.process.stdout.on('data', (b) => {
      const s = b.toString();
      lastStdout += s;
      this.logger.log('[zapret]', s.trim());
    });
    this.process.stderr.on('data', (b) => {
      const s = b.toString();
      lastStderr += s;
      this.logger.error('[zapret]', s.trim());
    });
    this.process.on('exit', (code) => {
      this.logger.log('[zapret] exited', code);
      this.process = null;
    });

    await new Promise((r) => setTimeout(r, 800));
    if (!this.isRunning()) {
      const tail = (lastStderr || lastStdout).trim().slice(-600) || '(no output)';
      throw new Error(
        `winws exited early.\nReason:\n${tail}\n\nCheck: (1) app launched as Administrator, (2) no other Zapret/GoodbyeDPI running, (3) WinDivert files present in exe/.`
      );
    }

    // Zapret is transparent — no proxy rules needed for Electron sessions.
    return { proxyRules: '', scope: 'system' };
  }

  async stop() {
    if (!this.isRunning()) return;
    await new Promise((resolve) => {
      this.process.once('exit', resolve);
      try { this.process.kill(); } catch { resolve(); }
    });
    this.process = null;
  }
}

module.exports = { ZapretEngine };
