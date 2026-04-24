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

  // Default arg set. Strategy preference order:
  //   1. resources/zapret/args.txt          (raw user-supplied flags)
  //   2. resources/zapret/bat/<strategy>.txt (Zapret2 GUI strategy file via winws @file)
  //   3. inline fallback flags
  defaultArgs() {
    const argsFile = path.join(this.root, 'args.txt');
    if (fs.existsSync(argsFile)) {
      const raw = fs.readFileSync(argsFile, 'utf8').trim();
      return raw.split(/\s+/).filter(Boolean);
    }
    const batDir = path.join(this.root, 'bat');
    if (fs.existsSync(batDir)) {
      // Default strategy: a broadly-working "all-sites" Zapret2 preset.
      const preferred = [
        'general_alt11_191_allsites.txt',
        'alt_general_faketlsauto_allsites.txt',
        'YTDisBystro_34_1.txt',
      ];
      for (const name of preferred) {
        const full = path.join(batDir, name);
        if (fs.existsSync(full)) return [`@${full}`];
      }
    }
    return [
      '--wf-tcp=80,443',
      '--wf-udp=443,50000-50100',
      '--filter-tcp=443',
      '--dpi-desync=fake,split2',
      '--dpi-desync-ttl=5',
      '--dpi-desync-fooling=md5sig',
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

  async start() {
    if (this.isRunning()) return { proxyRules: '' };
    await this.checkAvailable();

    const bin = this.winwsPath;
    const args = this.defaultArgs();

    // winws strategy files reference .bin payloads (quic_initial_*.bin, tls_clienthello_*.bin)
    // by bare filename. Those live in resources/zapret/bin/. Set cwd there so they resolve.
    const binDir = path.join(this.root, 'bin');
    const cwd = fs.existsSync(binDir) ? binDir : path.dirname(bin);

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
