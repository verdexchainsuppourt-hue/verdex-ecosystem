const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  hideToTray: () => ipcRenderer.send('window-hide-to-tray'),
  quitApp: () => ipcRenderer.send('window-quit'),
  onShowCloseDialog: (callback) => ipcRenderer.on('show-close-dialog', () => callback()),

  // Auth
  authSuccess: (userData) => ipcRenderer.send('auth-success', userData),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onUserData: (callback) => ipcRenderer.on('user-data', (event, data) => callback(data)),
  onOAuthSuccess: (callback) => ipcRenderer.on('oauth-success', (event, data) => callback(data)),

  // System
  getSystemSpecs: () => ipcRenderer.invoke('get-system-specs')
});
