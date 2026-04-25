// Periodic network speed sampler. On Windows uses PowerShell's
// Get-NetAdapterStatistics to read total bytes sent/received across all
// active adapters; computes per-second delta and emits to the renderer.

const { spawn } = require('node:child_process');

const SAMPLE_MS = 1000;
let timer = null;
let psProcess = null;
let lastRx = null;
let lastTx = null;
let lastTs = 0;

function format(out) {
  return { rxBps: out.rxBps, txBps: out.txBps, rxTotal: out.rxTotal, txTotal: out.txTotal };
}

function start(onSample, logger = console) {
  if (timer || process.platform !== 'win32') return;

  // Long-running PowerShell script: every second emit "rx,tx" line.
  // Get-NetAdapterStatistics has no Status field — join via Get-NetAdapter to keep only Up.
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$ups = @{}
foreach ($a in (Get-NetAdapter)) { if ($a.Status -eq 'Up') { $ups[$a.Name] = $true } }
while ($true) {
  $rx = [int64]0; $tx = [int64]0
  foreach ($s in (Get-NetAdapterStatistics)) {
    if ($ups[$s.Name]) {
      $rx += [int64]$s.ReceivedBytes
      $tx += [int64]$s.SentBytes
    }
  }
  Write-Output ("$rx,$tx")
  [Console]::Out.Flush()
  Start-Sleep -Seconds 1
}
  `.trim();

  try {
    psProcess = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', script,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    logger.error('[net-monitor] spawn failed:', e?.message);
    return;
  }

  psProcess.stderr.on('data', (chunk) => {
    logger.error('[net-monitor]', chunk.toString().trim());
  });
  let buf = '';
  psProcess.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const [rxStr, txStr] = line.split(',');
      const rx = Number(rxStr);
      const tx = Number(txStr);
      if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
      const now = Date.now();
      if (lastRx != null && lastTs) {
        const dt = (now - lastTs) / 1000;
        const rxBps = Math.max(0, (rx - lastRx) / dt);
        const txBps = Math.max(0, (tx - lastTx) / dt);
        try { onSample(format({ rxBps, txBps, rxTotal: rx, txTotal: tx })); } catch {}
      }
      lastRx = rx; lastTx = tx; lastTs = now;
    }
  });
  psProcess.on('exit', (code) => {
    logger.log('[net-monitor] powershell exited', code);
    psProcess = null;
  });
}

function stop() {
  if (psProcess) {
    try { psProcess.kill(); } catch {}
    psProcess = null;
  }
  if (timer) { clearInterval(timer); timer = null; }
  lastRx = lastTx = null;
}

module.exports = { start, stop };
