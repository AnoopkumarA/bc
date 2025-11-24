
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  toggleStealthMode: (enable) => ipcRenderer.invoke('toggle-stealth-mode', enable),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),
  isStealthSupported: async () => true, // Assume supported in Native app
  env: {
    API_KEY: process.env.API_KEY || process.env.REACT_APP_API_KEY
  }
});