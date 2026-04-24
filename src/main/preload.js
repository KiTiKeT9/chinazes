const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chinazes', {
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
