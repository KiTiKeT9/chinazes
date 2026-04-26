// Lazy-installs yt-dlp.exe to userData/bin and downloads videos into the notes
// folder. Used by IPC `notes:download-video`.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const { app } = require('electron');

const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

function ytDlpPath() {
  const dir = path.join(app.getPath('userData'), 'bin');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'yt-dlp.exe');
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    const file = fs.createWriteStream(tmp);
    let received = 0;
    let total = 0;
    function follow(u) {
      https.get(u, { headers: { 'User-Agent': 'chinazes' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(tmp, () => {});
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        total = parseInt(res.headers['content-length'] || '0', 10) || 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          onProgress?.({ phase: 'fetch-binary', received, total });
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => {
          fs.rename(tmp, dest, (err) => err ? reject(err) : resolve());
        }));
      }).on('error', reject);
    }
    follow(url);
  });
}

async function ensureYtDlp(onProgress) {
  const p = ytDlpPath();
  if (fs.existsSync(p)) return p;
  onProgress?.({ phase: 'installing-binary', message: 'Скачиваю yt-dlp...' });
  await downloadFile(YT_DLP_URL, p, onProgress);
  return p;
}

// Returns absolute path of the downloaded media file.
async function downloadVideo(url, destDir, onProgress) {
  if (!url) throw new Error('No URL');
  fs.mkdirSync(destDir, { recursive: true });
  const bin = await ensureYtDlp(onProgress);

  const outTemplate = path.join(destDir, 'video-%(id)s.%(ext)s');
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--restrict-filenames',
    '-f', 'best[ext=mp4][height<=1080]/best[ext=mp4]/best',
    '--newline',
    '-o', outTemplate,
    '--print', 'after_move:filepath',
    url,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true });
    let lastFile = '';
    let stderr = '';

    proc.stdout.on('data', (buf) => {
      const text = buf.toString();
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // yt-dlp emits the final filepath via --print after_move:filepath
        if (trimmed.startsWith(destDir) || /\.(mp4|webm|mkv|m4a)$/i.test(trimmed)) {
          if (fs.existsSync(trimmed)) lastFile = trimmed;
        }
        // Parse progress like "[download]   45.3% of  10.42MiB ..."
        const m = /\[download\]\s+([\d.]+)%/.exec(trimmed);
        if (m) onProgress?.({ phase: 'downloading', percent: parseFloat(m[1]) });
      }
    });

    proc.stderr.on('data', (b) => { stderr += b.toString(); });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(-400)}`));
      }
      if (!lastFile) {
        // Fallback: scan destDir for newest matching file.
        const candidates = fs.readdirSync(destDir)
          .filter((n) => /^video-.+\.(mp4|webm|mkv)$/i.test(n))
          .map((n) => path.join(destDir, n));
        candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        lastFile = candidates[0] || '';
      }
      if (!lastFile) return reject(new Error('Download finished but no output file found'));
      resolve(lastFile);
    });
  });
}

module.exports = { downloadVideo, ensureYtDlp };
