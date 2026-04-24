const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseShareLink } = require('../link-parser');

const SOCKS_PORT = 10808;
const HTTP_PORT = 10809;
const LOOPBACK = '127.0.0.1';

class XrayEngine {
  constructor({ userDataDir, resourcesDir, logger }) {
    this.userDataDir = userDataDir;
    this.resourcesDir = resourcesDir;
    this.logger = logger || console;
    this.process = null;
    this.id = 'xray';
  }

  get binaryPath() {
    const b = process.platform === 'win32' ? 'xray.exe' : 'xray';
    return path.join(this.resourcesDir, 'xray', b);
  }

  get configPath() {
    return path.join(this.userDataDir, 'xray-config.json');
  }

  isRunning() {
    return this.process && !this.process.killed && this.process.exitCode === null;
  }

  buildConfig(outbound) {
    return {
      log: { loglevel: 'warning' },
      inbounds: [
        {
          tag: 'socks-in',
          listen: LOOPBACK,
          port: SOCKS_PORT,
          protocol: 'socks',
          settings: { udp: true, auth: 'noauth' },
          sniffing: { enabled: true, destOverride: ['http', 'tls'] },
        },
        {
          tag: 'http-in',
          listen: LOOPBACK,
          port: HTTP_PORT,
          protocol: 'http',
          settings: {},
        },
      ],
      outbounds: [
        outbound,
        { tag: 'direct', protocol: 'freedom', settings: {} },
        { tag: 'block', protocol: 'blackhole', settings: {} },
      ],
      routing: {
        domainStrategy: 'IPIfNonMatch',
        rules: [{ type: 'field', ip: ['geoip:private'], outboundTag: 'direct' }],
      },
    };
  }

  // Accepts either a single share link or a pre-parsed { link, meta }
  writeConfigFromLink(link) {
    const { outbound, meta } = parseShareLink(link);
    const cfg = this.buildConfig(outbound);
    fs.mkdirSync(this.userDataDir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), 'utf8');
    return meta;
  }

  async start({ link } = {}) {
    if (this.isRunning()) return { proxyRules: `socks5://${LOOPBACK}:${SOCKS_PORT}` };

    if (!fs.existsSync(this.binaryPath)) {
      throw new Error(`xray binary not found at ${this.binaryPath}`);
    }
    if (link) this.writeConfigFromLink(link);
    if (!fs.existsSync(this.configPath)) {
      throw new Error('No xray config. Pass a share link first.');
    }

    this.process = spawn(
      this.binaryPath,
      ['run', '-c', this.configPath],
      { cwd: path.dirname(this.binaryPath), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );
    this.process.stdout.on('data', (b) => this.logger.log('[xray]', b.toString().trim()));
    this.process.stderr.on('data', (b) => this.logger.error('[xray]', b.toString().trim()));
    this.process.on('exit', (code) => {
      this.logger.log('[xray] exited', code);
      this.process = null;
    });

    await new Promise((r) => setTimeout(r, 400));
    if (!this.isRunning()) throw new Error('xray failed to start');

    return {
      proxyRules: `socks5://${LOOPBACK}:${SOCKS_PORT}`,
      socksPort: SOCKS_PORT,
      httpPort: HTTP_PORT,
    };
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

module.exports = { XrayEngine };
