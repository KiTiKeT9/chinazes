// Co-browsing engine — pairs a "host" Chinazes session with one or more
// "guests" via WebRTC datachannels (signalled by PeerJS public broker).
//
// Host streams JPEG frames captured from the active <webview> via
// `webview.capturePage()` at a configurable FPS, and replays input events
// received from guests via `webview.sendInputEvent(...)`.
//
// Permissions are enforced both client-side (guest UI hides disallowed
// actions) and host-side (incoming events are filtered against the session
// permission set before being applied). The host always retains the ability
// to disconnect a guest at any time.

import Peer from 'peerjs';

// PeerJS broker uses a 6-char prefix; we add a Chinazes namespace + random.
function genSessionId() {
  return 'chinazes-' + Math.random().toString(36).slice(2, 10);
}

export const ALL_PERMS = {
  mouseControl: 'Клики мышью',
  scroll:       'Прокрутка страницы',
  keyboard:     'Ввод с клавиатуры',
  mediaControl: 'Управление медиа (play/pause/seek)',
  volume:       'Изменение громкости',
  copy:         'Копирование текста',
  download:     'Скачивание файлов',
};

// -------------------- Host --------------------
export class CoBrowseHost {
  constructor({ permissions, fps = 5, onGuestChange, onError, onStatus }) {
    this.permissions = { ...permissions };
    this.fps = fps;
    this.guests = new Map(); // peerId -> dataConnection
    this.peer = null;
    this.sessionId = genSessionId();
    this.captureTimer = null;
    this.webviewEl = null;
    this.onGuestChange = onGuestChange || (() => {});
    this.onError = onError || console.error;
    this.onStatus = onStatus || (() => {});
    this.lastFrameAt = 0;
  }

  async start() {
    this.onStatus('Подключение к PeerJS...');
    this.peer = new Peer(this.sessionId, {
      debug: 1,
      // Default PeerJS Cloud (free, public) is used when no host is provided.
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Таймаут PeerJS')), 15000);
      this.peer.on('open', (id) => {
        clearTimeout(timer);
        this.onStatus('Сессия активна');
        this.peer.on('connection', (conn) => this._onGuest(conn));
        this._startCapture();
        resolve(id);
      });
      this.peer.on('error', (err) => {
        clearTimeout(timer);
        this.onError(err);
        reject(err);
      });
    });
  }

  setActiveWebview(webview) {
    this.webviewEl = webview;
  }

  setPermissions(perms) {
    this.permissions = { ...perms };
    // Notify all guests of the new permission set.
    for (const conn of this.guests.values()) {
      try { conn.send({ type: 'permissions', permissions: this.permissions }); } catch {}
    }
  }

  _onGuest(conn) {
    conn.on('open', () => {
      this.guests.set(conn.peer, conn);
      this.onGuestChange(Array.from(this.guests.keys()));
      try {
        conn.send({ type: 'permissions', permissions: this.permissions });
        conn.send({ type: 'hello', sessionId: this.sessionId });
      } catch {}
    });
    conn.on('data', (msg) => this._handleGuestMsg(conn, msg));
    conn.on('close', () => {
      this.guests.delete(conn.peer);
      this.onGuestChange(Array.from(this.guests.keys()));
    });
    conn.on('error', (e) => this.onError(e));
  }

  _handleGuestMsg(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    // Permission gate.
    const allow = (perm) => !!this.permissions[perm];
    const wv = this.webviewEl;
    if (!wv) return;

    try {
      switch (msg.type) {
        case 'mouse': {
          if (!allow('mouseControl')) return;
          const rect = this._frameSize();
          if (!rect) return;
          const x = Math.round(rect.w * (msg.xRatio || 0));
          const y = Math.round(rect.h * (msg.yRatio || 0));
          const button = msg.button || 'left';
          if (msg.action === 'click') {
            wv.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
            wv.sendInputEvent({ type: 'mouseUp',   x, y, button, clickCount: 1 });
          } else if (msg.action === 'down') {
            wv.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
          } else if (msg.action === 'up') {
            wv.sendInputEvent({ type: 'mouseUp',   x, y, button, clickCount: 1 });
          } else if (msg.action === 'move') {
            wv.sendInputEvent({ type: 'mouseMove', x, y });
          }
          break;
        }
        case 'wheel': {
          if (!allow('scroll')) return;
          const rect = this._frameSize();
          if (!rect) return;
          wv.sendInputEvent({
            type: 'mouseWheel',
            x: Math.round(rect.w * (msg.xRatio || 0.5)),
            y: Math.round(rect.h * (msg.yRatio || 0.5)),
            deltaX: msg.dx || 0,
            deltaY: msg.dy || 0,
            canScroll: true,
          });
          break;
        }
        case 'key': {
          if (!allow('keyboard')) return;
          if (msg.text) {
            wv.sendInputEvent({ type: 'char', keyCode: msg.text });
          } else if (msg.keyCode) {
            wv.sendInputEvent({ type: msg.action === 'up' ? 'keyUp' : 'keyDown', keyCode: msg.keyCode, modifiers: msg.modifiers || [] });
          }
          break;
        }
        case 'media': {
          if (!allow('mediaControl')) return;
          // Forwarded as media bridge command.
          try { wv.send('chinazes:media-command', msg.command); } catch {}
          break;
        }
        case 'volume': {
          if (!allow('volume')) return;
          try { wv.send('chinazes:media-command', { type: 'volume', value: msg.value }); } catch {}
          break;
        }
      }
    } catch (e) {
      this.onError(e);
    }
  }

  _frameSize() {
    if (!this._lastSize) return null;
    return this._lastSize;
  }

  _startCapture() {
    const intervalMs = Math.max(80, Math.round(1000 / this.fps));
    const tick = async () => {
      if (!this.peer || this.peer.destroyed) return;
      if (this.guests.size === 0) {
        this.captureTimer = setTimeout(tick, intervalMs);
        return;
      }
      try {
        if (!this.webviewEl || typeof this.webviewEl.capturePage !== 'function') {
          this.captureTimer = setTimeout(tick, intervalMs);
          return;
        }
        const img = await this.webviewEl.capturePage();
        if (!img || img.isEmpty?.()) {
          this.captureTimer = setTimeout(tick, intervalMs);
          return;
        }
        const size = img.getSize();
        this._lastSize = { w: size.width, h: size.height };
        const dataUrl = img.toDataURL({ scaleFactor: 0.5 });
        // Convert to JPEG via canvas for smaller payload.
        const jpeg = await this._toJpeg(dataUrl, 0.55);
        const payload = { type: 'frame', dataUrl: jpeg, w: size.width, h: size.height, ts: Date.now() };
        for (const conn of this.guests.values()) {
          if (conn.open) {
            try { conn.send(payload); } catch {}
          }
        }
        this.lastFrameAt = Date.now();
      } catch (e) {
        // Capture can fail when the webview is unloading; ignore.
      }
      this.captureTimer = setTimeout(tick, intervalMs);
    };
    tick();
  }

  _toJpeg(pngDataUrl, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(pngDataUrl);
      img.src = pngDataUrl;
    });
  }

  stop() {
    if (this.captureTimer) clearTimeout(this.captureTimer);
    for (const conn of this.guests.values()) {
      try { conn.close(); } catch {}
    }
    this.guests.clear();
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
    }
    this.peer = null;
    this.onStatus('Сессия закрыта');
  }
}

// -------------------- Guest --------------------
export class CoBrowseGuest {
  constructor({ sessionId, onFrame, onPermissions, onStatus, onError, onClose }) {
    this.sessionId = sessionId;
    this.peer = null;
    this.conn = null;
    this.permissions = {};
    this.onFrame = onFrame || (() => {});
    this.onPermissions = onPermissions || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || console.error;
    this.onClose = onClose || (() => {});
  }

  async connect() {
    this.onStatus('Подключение к PeerJS...');
    this.peer = new Peer({ debug: 1 });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Таймаут PeerJS')), 15000);
      this.peer.on('open', () => {
        clearTimeout(timer);
        this.onStatus('Подключение к хосту...');
        this.conn = this.peer.connect(this.sessionId, { reliable: false });
        this.conn.on('open', () => {
          this.onStatus('Подключено');
          resolve();
        });
        this.conn.on('data', (msg) => this._handleHostMsg(msg));
        this.conn.on('close', () => { this.onStatus('Соединение закрыто'); this.onClose(); });
        this.conn.on('error', (e) => this.onError(e));
      });
      this.peer.on('error', (e) => {
        clearTimeout(timer);
        this.onError(e);
        reject(e);
      });
    });
  }

  _handleHostMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'frame') this.onFrame(msg);
    else if (msg.type === 'permissions') {
      this.permissions = msg.permissions || {};
      this.onPermissions(this.permissions);
    } else if (msg.type === 'hello') {
      this.onStatus('Сессия: ' + msg.sessionId);
    }
  }

  send(msg) {
    if (this.conn?.open) {
      try { this.conn.send(msg); } catch {}
    }
  }

  disconnect() {
    if (this.conn) { try { this.conn.close(); } catch {} }
    if (this.peer) { try { this.peer.destroy(); } catch {} }
    this.conn = null;
    this.peer = null;
  }
}
