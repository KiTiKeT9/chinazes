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
  ai: {
    getConfig:  ()      => ipcRenderer.invoke('ai:get-config'),
    getFull:    ()      => ipcRenderer.invoke('ai:get-full'),
    setConfig:  (patch) => ipcRenderer.invoke('ai:set-config', patch),
    providers:  ()      => ipcRenderer.invoke('ai:providers'),
    chat:       (args)  => ipcRenderer.invoke('ai:chat', args),
    // Streaming: returns a function `cancel`. onChunk(delta), onDone({error?})
    chatStream: (args, onChunk, onDone) => {
      const requestId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const chunkFn = (_e, p) => { if (p?.requestId === requestId && p.delta) onChunk(p.delta); };
      const doneFn  = (_e, p) => {
        if (p?.requestId !== requestId) return;
        ipcRenderer.removeListener('ai:stream-chunk', chunkFn);
        ipcRenderer.removeListener('ai:stream-done', doneFn);
        onDone?.(p);
      };
      ipcRenderer.on('ai:stream-chunk', chunkFn);
      ipcRenderer.on('ai:stream-done', doneFn);
      ipcRenderer.send('ai:chat-stream', { requestId, ...args });
      return () => {
        ipcRenderer.removeListener('ai:stream-chunk', chunkFn);
        ipcRenderer.removeListener('ai:stream-done', doneFn);
      };
    },
  },
  apps: {
    list:    ()      => ipcRenderer.invoke('apps:list'),
    scan:    ()      => ipcRenderer.invoke('apps:scan'),
    launch:  (id)    => ipcRenderer.invoke('apps:launch', id),
    foldersGet: ()   => ipcRenderer.invoke('apps:folders:get'),
    foldersSet: (a)  => ipcRenderer.invoke('apps:folders:set', a),
    addManual: (payload) => ipcRenderer.invoke('apps:add-manual', payload),
    remove:    (id)      => ipcRenderer.invoke('apps:remove', id),
    pickFile:  ()        => ipcRenderer.invoke('apps:pick-file'),
    onScanProgress: (cb) => {
      const fn = (_e, p) => cb(p);
      ipcRenderer.on('apps:scan-progress', fn);
      return () => ipcRenderer.removeListener('apps:scan-progress', fn);
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
