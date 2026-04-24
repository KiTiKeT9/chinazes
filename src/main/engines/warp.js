const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');

const run = promisify(execFile);

const SOCKS_PORT = 40000; // default warp-cli proxy port
const LOOPBACK = '127.0.0.1';

let cachedWarpPath = null;

function findWarpCli() {
  if (cachedWarpPath) return cachedWarpPath;

  // Common Cloudflare WARP install paths on Windows.
  const candidates = [
    'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe',
    'C:\\Program Files (x86)\\Cloudflare\\Cloudflare WARP\\warp-cli.exe',
  ];
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Cloudflare', 'Cloudflare WARP', 'warp-cli.exe'));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) { cachedWarpPath = p; return p; }
  }
  // Fall back to PATH lookup.
  cachedWarpPath = 'warp-cli';
  return cachedWarpPath;
}

async function cli(args, timeout = 15000) {
  try {
    const { stdout, stderr } = await run(findWarpCli(), args, { timeout, windowsHide: true });
    return (stdout || stderr || '').toString().trim();
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    throw new Error(msg || `warp-cli ${args.join(' ')} failed`);
  }
}

class WarpEngine {
  constructor({ logger } = {}) {
    this.logger = logger || console;
    this.id = 'warp';
  }

  async checkAvailable() {
    try {
      await cli(['--version']);
      return true;
    } catch {
      throw new Error(
        "Cloudflare WARP (warp-cli) not found. Install the free 1.1.1.1 app from https://1.1.1.1/ and try again."
      );
    }
  }

  async start() {
    await this.checkAvailable();
    this.logger.log('[warp] using', findWarpCli());

    const tryAll = async (variants) => {
      let lastErr;
      for (const v of variants) {
        try { return await cli(v); } catch (e) { lastErr = e; }
      }
      throw lastErr;
    };

    // Register (idempotent on most warp-cli versions)
    try {
      await tryAll([
        ['registration', 'new'],
        ['--accept-tos', 'registration', 'new'],
        ['register'],
      ]);
    } catch (e) {
      this.logger.log('[warp] registration skipped:', e.message);
    }

    // Switch to SOCKS5 proxy mode
    try {
      const out = await tryAll([
        ['mode', 'proxy'],
        ['set-mode', 'proxy'],
      ]);
      this.logger.log('[warp] mode proxy:', out);
    } catch (e) {
      throw new Error(`warp-cli: cannot switch to proxy mode. ${e.message}`);
    }

    // Configure proxy port (best-effort)
    try {
      await tryAll([
        ['proxy', 'port', String(SOCKS_PORT)],
        ['set-proxy-port', String(SOCKS_PORT)],
      ]);
    } catch (e) {
      this.logger.log('[warp] proxy port skipped:', e.message);
    }

    // Connect
    try {
      const out = await cli(['connect']);
      this.logger.log('[warp] connect:', out);
    } catch (e) {
      if (!/already/i.test(e.message)) {
        throw new Error(`warp-cli connect failed: ${e.message}`);
      }
    }

    // Wait for the SOCKS listener
    await new Promise((r) => setTimeout(r, 1200));

    // Verify status
    try {
      const st = await cli(['status']);
      this.logger.log('[warp] status:', st);
      if (!/connected/i.test(st)) {
        throw new Error(`WARP not connected. Status:\n${st}`);
      }
    } catch (e) {
      if (/not connected|disconnected/i.test(e.message)) throw e;
      // non-fatal: some warp-cli builds have different status output
    }

    return {
      proxyRules: `socks5://${LOOPBACK}:${SOCKS_PORT}`,
      socksPort: SOCKS_PORT,
    };
  }

  async stop() {
    try { await cli(['disconnect']); } catch { /* best effort */ }
  }
}

module.exports = { WarpEngine };
