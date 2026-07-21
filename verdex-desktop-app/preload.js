const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  hideToTray: () => ipcRenderer.send('window-hide-to-tray'),
  showWindow: () => ipcRenderer.send('window-show'),
  quitApp: () => ipcRenderer.send('window-quit'),
  onShowCloseDialog: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('show-close-dialog', handler);
    return () => ipcRenderer.removeListener('show-close-dialog', handler);
  },
  onVisibility: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app-visibility', handler);
    return () => ipcRenderer.removeListener('app-visibility', handler);
  },

  // Auth
  authSuccess: (userData) => ipcRenderer.send('auth-success', userData),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onUserData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('user-data', handler);
    return () => ipcRenderer.removeListener('user-data', handler);
  },
  onOAuthSuccess: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('oauth-success', handler);
    return () => ipcRenderer.removeListener('oauth-success', handler);
  },

  // Mining status → tray tooltip / menu
  reportMiningStatus: (status) => ipcRenderer.send('mining-status', status),

  // Auto-update
  getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  skipUpdate: () => ipcRenderer.send('skip-update'),
  onUpdateProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // System
  getSystemSpecs: () => ipcRenderer.invoke('get-system-specs')
});
