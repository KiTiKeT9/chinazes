const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chinazes', {
  app: {
    getVersion:    () => ipcRenderer.invoke('app:get-version'),
    setUserAgent:  (ua) => ipcRenderer.invoke('app:set-user-agent', ua),
  },
  net: {
    onStats: (callback) => {
      const listener = (_e, stats) => callback(stats);
      ipcRenderer.on('net:stats', listener);
      return () => ipcRenderer.removeListener('net:stats', listener);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  proxy: {
    getState:       () => ipcRenderer.invoke('proxy:get-state'),
    getConfig:      () => ipcRenderer.invoke('proxy:get-config'),
    importLink:     (input) => ipcRenderer.invoke('proxy:import-link', input),
    refreshSubscription: () => ipcRenderer.invoke('proxy:refresh-subscription'),
    probeServers:        (opts) => ipcRenderer.invoke('proxy:probe-servers', opts),
    clearXray:           () => ipcRenderer.invoke('proxy:clear-xray'),
    selectServer:   (index) => ipcRenderer.invoke('proxy:select-server', index),
    setEngine:      (engineId) => ipcRenderer.invoke('proxy:set-engine', engineId),
    connect:        () => ipcRenderer.invoke('proxy:connect'),
    disconnect:     () => ipcRenderer.invoke('proxy:disconnect'),
    onState: (callback) => {
      const listener = (_e, state) => callback(state);
      ipcRenderer.on('proxy:state', listener);
      return () => ipcRenderer.removeListener('proxy:state', listener);
    },
  },
  notes: {
    list:   ()        => ipcRenderer.invoke('notes:list'),
    add:    (payload) => ipcRenderer.invoke('notes:add', payload),
    remove: (id)      => ipcRenderer.invoke('notes:remove', id),
    copy:   (id)      => ipcRenderer.invoke('notes:copy', id),
    drag:   (id)      => ipcRenderer.invoke('notes:drag', id),
    downloadVideo: (url) => ipcRenderer.invoke('notes:download-video', url),
    onDownloadProgress: (cb) => {
      const fn = (_e, p) => cb(p);
      ipcRenderer.on('notes:download-progress', fn);
      return () => ipcRenderer.removeListener('notes:download-progress', fn);
    },
  },
  screenShare: {
    // Main → renderer: 'screen-share:request' with sources, renderer responds via answer().
    onRequest: (cb) => {
      const fn = (_e, payload) => cb(payload);
      ipcRenderer.on('screen-share:request', fn);
      return () => ipcRenderer.removeListener('screen-share:request', fn);
    },
    answer: (requestId, sourceId) => ipcRenderer.send('screen-share:answer', { requestId, sourceId }),
  },
  updater: {
    check:   () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    state:   () => ipcRenderer.invoke('updater:state'),
    on: (callback) => {
      const events = ['available', 'none', 'progress', 'downloaded', 'error'];
      const listeners = events.map((ev) => {
        const channel = `updater:${ev}`;
        const fn = (_e, payload) => callback(ev, payload);
        ipcRenderer.on(channel, fn);
        return [channel, fn];
      });
      return () => listeners.forEach(([c, f]) => ipcRenderer.removeListener(c, f));
    },
  },
});
