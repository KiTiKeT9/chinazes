// WARP+ engine — based on bepass-org/warp-plus.
// Single-binary Go reimplementation of the Cloudflare WARP client with:
//   - Endpoint scanner (auto-finds working Cloudflare IPs that aren't blocked)
//   - AmneziaWG / WARP-in-WARP obfuscation (bypasses DPI)
//   - Built-in SOCKS5 server (default 127.0.0.1:8086)
//   - No GUI dependency, no admin rights needed
//
// Binary location: resources/warp-plus/warp-plus.exe
// Cache location:  <userData>/warp-plus-cache/
//
// Download from: https://github.com/bepass-org/warp-plus/releases

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const SOCKS_HOST = '127.0.0.1';
const SOCKS_PORT = 8086;
const READY_REGEX = /serving (proxy|socks)|listening on|ready/i;
const READY_TIMEOUT_MS = 60_000;

class WarpPlusEngine {
  constructor({ resourcesDir, userDataDir }) {
    this.resourcesDir = resourcesDir;
    this.userDataDir  = userDataDir;
    this.proc = null;
    this.starting = null;
    this.lastLog = '';
  }

  binaryPath() {
    return path.join(this.resourcesDir, 'warp-plus', 'warp-plus.exe');
  }

  cacheDir() {
    return path.join(this.userDataDir, 'warp-plus-cache');
  }

  async start({ gool = true, scan = true } = {}) {
    if (this.proc) return { socksPort: SOCKS_PORT, proxyRules: `socks5://${SOCKS_HOST}:${SOCKS_PORT}` };
    if (this.starting) return this.starting;

    const bin = this.binaryPath();
    if (!fs.existsSync(bin)) {
      throw new Error(
        `warp-plus.exe не найден.\n` +
        `Скачай последний релиз с https://github.com/bepass-org/warp-plus/releases\n` +
        `и положи warp-plus.exe в:\n${path.dirname(bin)}\\`
      );
    }

    fs.mkdirSync(this.cacheDir(), { recursive: true });

    const args = [
      '--bind', `${SOCKS_HOST}:${SOCKS_PORT}`,
      '--cache-dir', this.cacheDir(),
    ];
    if (scan) args.push('--scan');
    if (gool) args.push('--gool');
    // No --country flag: scanner picks the fastest globally.

    this.proc = spawn(bin, args, {
      cwd: this.cacheDir(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.starting = new Promise((resolve, reject) => {
      let resolved = false;
      const onReady = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve({
          socksPort: SOCKS_PORT,
          proxyRules: `socks5://${SOCKS_HOST}:${SOCKS_PORT}`,
        });
      };
      const onLine = (line) => {
        this.lastLog = line;
        if (READY_REGEX.test(line)) onReady();
      };
      const collect = (chunk) => {
        const text = chunk.toString();
        text.split(/\r?\n/).forEach((l) => l.trim() && onLine(l.trim()));
      };
      this.proc.stdout.on('data', collect);
      this.proc.stderr.on('data', collect);
      this.proc.once('exit', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          reject(new Error(
            `warp-plus exited (code ${code}). Last log: ${this.lastLog || '(empty)'}`
          ));
        }
        this.proc = null;
        this.starting = null;
      });
      this.proc.once('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          reject(err);
        }
      });
      const timer = setTimeout(() => {
        // Even without a clear "ready" log line, after this timeout assume
        // the binary is up — warp-plus keeps scanning in background but
        // the SOCKS port opens early.
        if (!resolved) onReady();
      }, 3000);
      // Hard fail if nothing happened within READY_TIMEOUT_MS
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { this.proc?.kill(); } catch {}
          this.proc = null;
          this.starting = null;
          reject(new Error(`warp-plus did not become ready in ${READY_TIMEOUT_MS / 1000}s. Last log: ${this.lastLog}`));
        }
      }, READY_TIMEOUT_MS);
    });

    try {
      const result = await this.starting;
      this.starting = null;
      return result;
    } catch (e) {
      this.starting = null;
      throw e;
    }
  }

  async stop() {
    if (!this.proc) return;
    const p = this.proc;
    this.proc = null;
    try { p.kill(); } catch {}
    // Give it a beat to exit cleanly.
    await new Promise((r) => setTimeout(r, 200));
  }
}

module.exports = { WarpPlusEngine };
