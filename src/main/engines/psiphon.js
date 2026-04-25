// Psiphon engine — open-source anti-censorship tunnel.
// Uses psiphon-tunnel-core ConsoleClient binary.
// Project: https://github.com/Psiphon-Labs/psiphon-tunnel-core
//
// Drop the Windows binary at:
//   resources/psiphon/psiphon-tunnel-core.exe
//
// On Connect we spawn it with a generated config in <userData>/psiphon/.
// It exposes a local SOCKS5 proxy that we route the webview sessions through.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SOCKS_PORT = 1099;

// Default config. Public propagation/sponsor IDs from the Psiphon Labs sample —
// works out-of-the-box for circumvention. EgressRegion empty = pick best.
function buildConfig({ dataDir }) {
  return {
    PropagationChannelId: 'FFFFFFFFFFFFFFFF',
    SponsorId: 'FFFFFFFFFFFFFFFF',
    RemoteServerListUrl: 'https://s3.amazonaws.com/psiphon/web/mjr4-p23r-puwl/server_list_compressed',
    RemoteServerListSignaturePublicKey:
      'MIICIDANBgkqhkiG9w0BAQEFAAOCAg0AMIICCAKCAgEAt7Ls+/39r+T6zNW7GiVpJfzq/xvL9SBH5rIFnk0RXYEYavax3WS6HOD35eTAqn8AniOwiH+DOkvgSKF2caqk/y1dfq47Pdymtwzp9ikpB1C5OfAysXzBiwVJlCdajBKvBZDerV1cMvRzCKvKwRmvDmHgphQQ7WfXIGbRbmmk6opMBh3roE42KcotLFtqp0RRwLtcBRNtCdsrVsjiI1Lqz/lH+T61sGjSjQ3CHMuZYSQJZo/KrvzgQXpkaCTdbObxHqb6/+i1qaVOfEsvjoiyzTxJADvSytVtcTjijhPEV6XskJVHE1Zgl+7rATr/pDQkw6DPCNBS1+Y6fy7GstZALQXwEDN/qhQI9kWkHijT8ns+i1vGg00Mk/6J75arLhqcodWsdeG/M/moWgqQAnlZAGVtJI1OgeF5fsPpXu4kctOfqZmqgX67xGoCe5h03eb87NygAfgi45vOqOLSLagQwVZb+5AFolCrlb3cynnCzbHHTRmH7LQRVXxjlkRtbYW5SXyPbhYeCYNTI8IIVoIBnH27NKeAyB6sqYfZsdfXZLA10R6vrf1V/pPJDlcRCgQA8kDLs6m0nDV6tcsezdMblfb6PfpgC4QtQv47R0ZE5OOYxs1H6c2DMS5dKXBZDc+VAFxPUDIArEcSbMcoJtYMSZWlIRBP8w5lPKf1xv12VRQhcr8CAQM=',
    ObfuscatedServerListRootURL:
      'https://s3.amazonaws.com/psiphon/web/mjr4-p23r-puwl/osl',
    DataStoreDirectory: dataDir,
    LocalSocksProxyPort: SOCKS_PORT,
    LocalHttpProxyPort: 0,
    EgressRegion: '',
    UseIndistinguishableTLS: true,
    DisableLocalHTTPProxy: true,
    DisableLocalSocksProxy: false,
    EmitDiagnosticNotices: true,
    EmitBytesTransferred: false,
  };
}

class PsiphonEngine {
  constructor({ resourcesDir, userDataDir, logger } = {}) {
    this.resourcesDir = resourcesDir;
    this.userDataDir = userDataDir;
    this.logger = logger || console;
    this.process = null;
    this.id = 'psiphon';
    this.bootstrapped = false;
    this.region = '';
  }

  get binary() {
    const root = path.join(this.resourcesDir, 'psiphon');
    const candidates = [
      'psiphon-tunnel-core.exe',
      'psiphon-tunnel-core-x86_64.exe',
      'ConsoleClient.exe',
    ];
    for (const c of candidates) {
      const p = path.join(root, c);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  get dataDir() {
    return path.join(this.userDataDir, 'psiphon');
  }

  get configPath() {
    return path.join(this.dataDir, 'config.json');
  }

  async checkAvailable() {
    const bin = this.binary;
    if (!bin) {
      throw new Error(
        'psiphon-tunnel-core.exe not found. Download Windows release from\n' +
        'https://github.com/Psiphon-Labs/psiphon-tunnel-core/releases\n' +
        'and place it at resources/psiphon/psiphon-tunnel-core.exe'
      );
    }
  }

  setRegion(region) { this.region = region || ''; }

  isRunning() {
    return this.process && !this.process.killed && this.process.exitCode === null;
  }

  async start() {
    if (this.isRunning()) {
      return { proxyRules: `socks5://127.0.0.1:${SOCKS_PORT}` };
    }
    await this.checkAvailable();

    fs.mkdirSync(this.dataDir, { recursive: true });
    const cfg = buildConfig({ dataDir: this.dataDir });
    if (this.region) cfg.EgressRegion = this.region;
    fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), 'utf8');

    const bin = this.binary;
    this.bootstrapped = false;

    this.logger.log('[psiphon] spawn', bin, '--config', this.configPath);
    this.process = spawn(bin, ['--config', this.configPath], {
      cwd: this.dataDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let lastErr = '';
    this.process.stdout.on('data', (b) => {
      const s = b.toString();
      lastErr += s;
      // Psiphon emits notices as JSON lines; surface tunnel state.
      for (const line of s.split('\n')) {
        if (!line.trim()) continue;
        try {
          const n = JSON.parse(line);
          if (n.noticeType === 'Tunnels' && n.data?.count > 0) {
            this.bootstrapped = true;
            this.logger.log('[psiphon] tunnel ready');
          } else if (n.noticeType === 'ListeningSocksProxyPort') {
            this.logger.log('[psiphon] SOCKS port', n.data?.port);
          } else if (n.noticeType === 'Alert' || n.noticeType === 'Error') {
            this.logger.log('[psiphon]', n.noticeType, JSON.stringify(n.data));
          }
        } catch { /* not json — ignore */ }
      }
    });
    this.process.stderr.on('data', (b) => {
      const s = b.toString();
      lastErr += s;
      this.logger.error('[psiphon]', s.trim());
    });
    this.process.on('exit', (code, signal) => {
      this.logger.log('[psiphon] exited', code, signal || '');
      this.process = null;
      this.bootstrapped = false;
    });

    // Wait up to 30s for tunnel bootstrap.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (this.bootstrapped) break;
      if (!this.isRunning()) {
        const tail = lastErr.trim().slice(-600) || '(no output)';
        throw new Error(`psiphon exited early.\n${tail}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!this.bootstrapped) {
      throw new Error('Psiphon failed to bootstrap a tunnel within 30 seconds (network/firewall?).');
    }

    return { proxyRules: `socks5://127.0.0.1:${SOCKS_PORT}`, scope: 'app' };
  }

  async stop() {
    if (!this.isRunning()) return;
    await new Promise((resolve) => {
      this.process.once('exit', resolve);
      try { this.process.kill(); } catch { resolve(); }
    });
    this.process = null;
    this.bootstrapped = false;
  }
}

module.exports = { PsiphonEngine };
