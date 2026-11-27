const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('heaven', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, cb) => {
    if (!['data:changed', 'sync:status', 'window:fullscreen', 'license:changed'].includes(channel)) return () => {};
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  platform: process.platform,
});
