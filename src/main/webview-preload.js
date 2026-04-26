// Injected via session.setPreloads() into every webview.
// Stubs WebAuthn / passkey APIs so sites that probe `navigator.credentials.get()`
// don't trigger the Windows "Select a passkey" dialog.

const { webFrame, ipcRenderer, contextBridge } = require('electron');

// Expose a tiny bridge inside webview so user plugins (CSS+JS injected via
// applyPlugins) can ask the host app to perform privileged actions like
// downloading a video into the notes folder. We use sendToHost so the request
// reaches the parent <webview>'s host (renderer App), which then forwards via
// the main-IPC bridge.
try {
  // Older webviews have no contextBridge; fall back to direct window prop.
  if (typeof contextBridge !== 'undefined' && contextBridge.exposeInMainWorld) {
    contextBridge.exposeInMainWorld('chinazesGuest', {
      downloadVideo: (url) => ipcRenderer.sendToHost('chinazes:download-video', url),
    });
  } else {
    window.chinazesGuest = {
      downloadVideo: (url) => ipcRenderer.sendToHost('chinazes:download-video', url),
    };
  }
} catch {}

const stub = `(() => {
  try {
    const denyError = () => {
      const e = new Error('NotAllowedError');
      e.name = 'NotAllowedError';
      return e;
    };
    if (navigator.credentials) {
      navigator.credentials.get    = () => Promise.reject(denyError());
      navigator.credentials.create = () => Promise.reject(denyError());
    }
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false);
      window.PublicKeyCredential.isConditionalMediationAvailable               = () => Promise.resolve(false);
    }
  } catch (_) {}
})();`;

// Inject before any page script runs (webFrame runs at preload time).
webFrame.executeJavaScript(stub).catch(() => {});
