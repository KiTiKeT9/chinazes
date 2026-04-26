// Notes / clipper backend.
// Stores user-saved media (images, gifs, videos, text) in `<userData>/notes/`
// and indexes them in `notes.json`. Renderer can list/add/delete/copy/drag.

const { app, clipboard, nativeImage, ipcMain, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let notesDir;
let indexPath;
let index = []; // [{ id, type, ext, file, label, createdAt, mime, text? }]

function init() {
  notesDir = path.join(app.getPath('userData'), 'notes');
  indexPath = path.join(notesDir, 'index.json');
  fs.mkdirSync(notesDir, { recursive: true });
  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    index = JSON.parse(raw);
    if (!Array.isArray(index)) index = [];
  } catch { index = []; }
}

function saveIndex() {
  try { fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8'); }
  catch (e) { console.error('[notes] saveIndex failed:', e?.message); }
}

function detectType(mime, name) {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/gif') || n.endsWith('.gif')) return 'gif';
  if (m.startsWith('image/'))  return 'image';
  if (m.startsWith('video/'))  return 'video';
  if (m.startsWith('audio/'))  return 'audio';
  return 'file';
}

function publicNote(n) {
  // Use custom protocol so the renderer can load media without file:// security issues.
  const fileUrl = n.file ? `chinazes-note://${path.basename(n.file)}` : null;
  return { ...n, fileUrl };
}

// Register custom protocol that maps chinazes-note://<filename> -> notes/<filename>.
function registerProtocol() {
  protocol.handle('chinazes-note', (req) => {
    try {
      const url = new URL(req.url);
      // Hostname is the filename in chinazes-note://<filename>
      const filename = decodeURIComponent(url.hostname || url.pathname.replace(/^\//, ''));
      // Defence: keep within notesDir
      const full = path.join(notesDir, filename);
      if (!full.startsWith(notesDir)) {
        return new Response('forbidden', { status: 403 });
      }
      return net.fetch(`file://${full.replace(/\\/g, '/')}`);
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }
  });
}

function list() {
  return index.slice().sort((a, b) => b.createdAt - a.createdAt).map(publicNote);
}

function add({ type, mime, name, dataBase64, text, label }) {
  const id = crypto.randomBytes(6).toString('hex');
  const createdAt = Date.now();
  let entry;
  if (text != null) {
    entry = { id, type: 'text', text, label: label || text.slice(0, 40), createdAt };
  } else {
    const ext = (path.extname(name || '') || '').slice(1).toLowerCase() || guessExt(mime);
    const file = path.join(notesDir, `${id}${ext ? '.' + ext : ''}`);
    fs.writeFileSync(file, Buffer.from(dataBase64, 'base64'));
    entry = {
      id,
      type: type || detectType(mime, name),
      ext,
      mime: mime || '',
      file,
      label: label || name || `${type || 'file'}-${id}`,
      createdAt,
    };
  }
  index.unshift(entry);
  saveIndex();
  return publicNote(entry);
}

function guessExt(mime) {
  const m = (mime || '').toLowerCase();
  if (m === 'image/png')  return 'png';
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/gif')  return 'gif';
  if (m === 'image/webp') return 'webp';
  if (m === 'video/mp4')  return 'mp4';
  if (m === 'video/webm') return 'webm';
  return '';
}

// Add a note for a file that already lives inside notesDir (e.g. downloaded
// video by yt-dlp). Caller is responsible for ensuring the file is in notesDir.
function addExistingFile({ file, type, label, mime }) {
  if (!file || !fs.existsSync(file)) return null;
  const id = crypto.randomBytes(6).toString('hex');
  const ext = (path.extname(file) || '').slice(1).toLowerCase();
  const entry = {
    id,
    type: type || detectType(mime || '', file),
    ext,
    mime: mime || '',
    file,
    label: label || path.basename(file),
    createdAt: Date.now(),
  };
  index.unshift(entry);
  saveIndex();
  return publicNote(entry);
}

function getNotesDir() { return notesDir; }

function remove(id) {
  const i = index.findIndex((n) => n.id === id);
  if (i < 0) return false;
  const [removed] = index.splice(i, 1);
  if (removed.file) { try { fs.unlinkSync(removed.file); } catch {} }
  saveIndex();
  return true;
}

function copyToClipboard(id) {
  const n = index.find((x) => x.id === id);
  if (!n) return false;
  if (n.type === 'text') {
    clipboard.writeText(n.text || '');
    return true;
  }
  if (n.type === 'image' && n.file) {
    try {
      const img = nativeImage.createFromPath(n.file);
      if (!img.isEmpty()) { clipboard.writeImage(img); return true; }
    } catch {}
  }
  // Fallback: write file path; some chats accept it.
  if (n.file) { clipboard.writeText(n.file); return true; }
  return false;
}

// Initiate native OS drag for file-type notes. Renderer calls this with id;
// the calling webContents starts the drag with the file.
function startDrag(senderWc, id) {
  const n = index.find((x) => x.id === id);
  if (!n || !n.file) return false;
  try {
    // 1x1 transparent png as drag icon (Electron requires a valid icon).
    const icon = nativeImage.createFromBuffer(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
      'base64'
    ));
    senderWc.startDrag({ file: n.file, icon });
    return true;
  } catch (e) {
    console.error('[notes] startDrag failed:', e?.message);
    return false;
  }
}

function register() {
  registerProtocol();
  ipcMain.handle('notes:list',   () => list());
  ipcMain.handle('notes:add',    (_e, payload) => add(payload || {}));
  ipcMain.handle('notes:remove', (_e, id)      => remove(id));
  ipcMain.handle('notes:copy',   (_e, id)      => copyToClipboard(id));
  ipcMain.handle('notes:drag',   (e, id)       => startDrag(e.sender, id));
}

module.exports = { init, register, addExistingFile, getNotesDir };
