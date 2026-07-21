const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(String.fromCharCode(101,108,101,99,116,114,111,110,65,80,73), {
  
  minimize: () => ipcRenderer.send(String.fromCharCode(119,105,110,100,111,119,45,109,105,110)),
  maximize: () => ipcRenderer.send(String.fromCharCode(119,105,110,100,111,119,45,109,97,120)),
  close: () => ipcRenderer.send(String.fromCharCode(119,105,110,100,111,119,45,99,108,111,115,101)),
  hideToTray: () => ipcRenderer.send(String.fromCharCode(119,105,110,100,111,119,45,104,105,100,101,45,116,111,45,116,114,97,121)),
  quitApp: () => ipcRenderer.send(String.fromCharCode(119,105,110,100,111,119,45,113,117,105,116)),
  onShowCloseDialog: (callback) => ipcRenderer.on(String.fromCharCode(115,104,111,119,45,99,108,111,115,101,45,100,105,97,108,111,103), () => callback()),

  
  authSuccess: (userData) => ipcRenderer.send(String.fromCharCode(97,117,116,104,45,115,117,99,99,101,115,115), userData),
  openExternal: (url) => ipcRenderer.send(String.fromCharCode(111,112,101,110,45,101,120,116,101,114,110,97,108), url),
  onUserData: (callback) => ipcRenderer.on(String.fromCharCode(117,115,101,114,45,100,97,116,97), (event, data) => callback(data)),
  onOAuthSuccess: (callback) => ipcRenderer.on(String.fromCharCode(111,97,117,116,104,45,115,117,99,99,101,115,115), (event, data) => callback(data)),

  
  getSystemSpecs: () => ipcRenderer.invoke(String.fromCharCode(103,101,116,45,115,121,115,116,101,109,45,115,112,101,99,115))
});
