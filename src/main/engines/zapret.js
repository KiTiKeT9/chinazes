// Zapret 2 engine — packet-level DPI bypass via WinDivert.
//
// Unlike v2ray/Xray/WARP/Psiphon, Zapret does NOT open a SOCKS proxy.
// It modifies TCP/UDP packets in-flight at the kernel level (WinDivert driver),
// so once it's running everything on the PC benefits — browser, webviews, games.
//
// Strategy: detect existing user-installed Zapret 2.
//   - If running → mark connected (external). Do nothing else (don't double-launch).
//   - If installed but not running → start it via Zapret.exe.
//   - If not installed → tell user to install from
//     https://github.com/youtubediscord/zapret/releases/latest
//
// We deliberately don't bundle our own winws2.exe inside Chinazes:
//   1. Binary is large (~10 MB) and includes WinDivert kernel driver (admin install).
//   2. Running two instances of WinDivert filters at once causes packet conflicts.
//   3. User's standalone Zapret 2 with their own tuned strategy works better than
//      a generic config we'd ship.

const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileP = promisify(execFile);

const PROCESS_NAMES = ['winws2.exe', 'winws.exe', 'Zapret.exe'];

class ZapretEngine {
  constructor({ userDataDir, resourcesDir }) {
    this.userDataDir  = userDataDir;
    this.resourcesDir = resourcesDir;
    this.detected     = null;   // { installPath, version, running }
    this.proc         = null;   // child process if we launched it
  }

  // ---------- Detection ----------

  // Check Win32 uninstall registry for "Zapret 2".
  async detectInstall() {
    const keys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];
    for (const root of keys) {
      try {
        const { stdout } = await execFileP('reg.exe', ['query', root, '/s', '/f', 'Zapret', '/d'], {
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
        });
        // Find blocks where DisplayName contains "Zapret 2"
        const blocks = stdout.split(/\r?\n\r?\n/);
        for (const block of blocks) {
          if (!/Zapret\s*2/i.test(block)) continue;
          const installMatch  = block.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
          const versionMatch  = block.match(/DisplayVersion\s+REG_SZ\s+([^\r\n]+)/i);
          const installPath   = installMatch ? installMatch[1].trim().replace(/\\$/, '') : null;
          if (installPath && fs.existsSync(installPath)) {
            return { installPath, version: versionMatch ? versionMatch[1].trim() : 'unknown' };
          }
        }
      } catch { /* key missing or no matches — continue */ }
    }
    return null;
  }

  // Returns array of running PIDs (zapret-related).
  async detectRunning() {
    try {
      const { stdout } = await execFileP('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true });
      const pids = [];
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^"([^"]+)","(\d+)"/);
        if (!m) continue;
        const [, name, pid] = m;
        if (PROCESS_NAMES.some((n) => n.toLowerCase() === name.toLowerCase())) {
          pids.push({ name, pid: Number(pid) });
        }
      }
      return pids;
    } catch {
      return [];
    }
  }

  async detect() {
    const [install, running] = await Promise.all([this.detectInstall(), this.detectRunning()]);
    this.detected = { ...(install || {}), running };
    return this.detected;
  }

  // ---------- Lifecycle ----------

  async start() {
    const info = await this.detect();
    const running = info.running || [];

    if (running.length > 0) {
      // External Zapret 2 already running → we just piggyback on its system-wide bypass.
      return {
        socksPort: null,
        proxyRules: '', // no proxy needed; zapret operates at packet level
        external: true,
        message: `Zapret 2 уже запущен (${running.map((r) => r.name).join(', ')}). Используем существующий обход.`,
      };
    }

    if (!info.installPath) {
      throw new Error(
        'Zapret 2 не установлен.\n' +
        'Скачайте установщик: https://github.com/youtubediscord/zapret/releases/latest\n' +
        'После установки запустите Zapret 2 один раз и переподключитесь.'
      );
    }

    // Installed but not running — try to launch the GUI in tray mode.
    const exe = path.join(info.installPath, 'Zapret.exe');
    if (!fs.existsSync(exe)) {
      throw new Error(`Zapret 2 найден в ${info.installPath}, но Zapret.exe отсутствует. Переустановите.`);
    }

    try {
      this.proc = spawn(exe, [], {
        cwd: info.installPath,
        windowsHide: false,
        detached: true,
        stdio: 'ignore',
      });
      this.proc.unref();
    } catch (e) {
      throw new Error(`Не удалось запустить Zapret 2: ${e.message}`);
    }

    // Wait briefly and re-check that winws2.exe came up.
    await new Promise((r) => setTimeout(r, 2500));
    const after = await this.detectRunning();
    if (after.length === 0) {
      throw new Error(
        'Zapret 2 запущен, но winws2.exe не активен.\n' +
        'Откройте Zapret 2 вручную и нажмите «Запустить».'
      );
    }

    return {
      socksPort: null,
      proxyRules: '',
      external: false,
      message: `Zapret 2 ${info.version || ''} запущен из ${info.installPath}`,
    };
  }

  async stop() {
    // We never kill external Zapret — user manages it themselves.
    // If we spawned Zapret.exe, just drop our handle (it's detached anyway).
    this.proc = null;
  }
}

module.exports = { ZapretEngine };
