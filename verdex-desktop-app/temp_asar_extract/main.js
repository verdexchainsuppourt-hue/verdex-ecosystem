const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const si = require('systeminformation');

let oauthServer = null;
let splashWindow = null;
let authWindow = null;
let mainWindow = null;
let tray = null;
let appIsQuitting = false;

const ICON_PATH = path.join(__dirname, String.fromCharCode(97,115,115,101,116,115), String.fromCharCode(105,99,111,110,46,105,99,111));

function getAppIcon() {
  try {
    return nativeImage.createFromPath(ICON_PATH);
  } catch {
    return nativeImage.createEmpty();
  }
}

function createTray() {
  if (tray) return;
  tray = new Tray(getAppIcon());
  tray.setToolTip(String.fromCharCode(86,101,114,100,101,120,32,77,105,110,101,114,32,8212,32,82,117,110,110,105,110,103,32,105,110,32,98,97,99,107,103,114,111,117,110,100));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: String.fromCharCode(83,104,111,119,32,86,101,114,100,101,120,32,77,105,110,101,114),
      click: () => {
        const win = mainWindow || authWindow;
        if (win) {
          win.show();
          win.focus();
        } else {
          createSplashWindow();
        }
      }
    },
    { type: String.fromCharCode(115,101,112,97,114,97,116,111,114) },
    {
      label: String.fromCharCode(81,117,105,116,32,86,101,114,100,101,120),
      click: () => {
        appIsQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on(String.fromCharCode(100,111,117,98,108,101,45,99,108,105,99,107), () => {
    const win = mainWindow || authWindow;
    if (win) {
      win.show();
      win.focus();
    }
  });
}

function hideToTray(win) {
  if (!tray) createTray();
  win.hide();
}

function attachCloseHandler(win) {
  win.on(String.fromCharCode(99,108,111,115,101), (e) => {
    if (appIsQuitting) return;
    e.preventDefault();
    win.webContents.send(String.fromCharCode(115,104,111,119,45,99,108,111,115,101,45,100,105,97,108,111,103));
  });
}




function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 680,
    height: 460,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    minimizable: true,
    skipTaskbar: true,
    center: true,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(String.fromCharCode(115,112,108,97,115,104,46,104,116,109,108));
  splashWindow.once(String.fromCharCode(114,101,97,100,121,45,116,111,45,115,104,111,119), () => {
    splashWindow.show();
    setTimeout(() => {
      createAuthWindow();
    }, 3200);
  });
}




function createAuthWindow() {
  authWindow = new BrowserWindow({
    width: 960,
    height: 680,
    frame: false,
    show: false,
    center: true,
    resizable: false,
    minimizable: true,
    backgroundColor: String.fromCharCode(35,48,53,48,97,48,53),
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, String.fromCharCode(112,114,101,108,111,97,100,46,106,115)),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  authWindow.loadFile(String.fromCharCode(97,117,116,104,46,104,116,109,108));
  authWindow.once(String.fromCharCode(114,101,97,100,121,45,116,111,45,115,104,111,119), () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    authWindow.show();
  });

  attachCloseHandler(authWindow);
}




function createMainWindow(userData) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    show: false,
    center: true,
    resizable: true,
    minimizable: true,
    backgroundColor: String.fromCharCode(35,48,98,48,100,49,55),
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, String.fromCharCode(112,114,101,108,111,97,100,46,106,115)),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(String.fromCharCode(117,105,47,105,110,100,101,120,46,104,116,109,108));

  mainWindow.once(String.fromCharCode(114,101,97,100,121,45,116,111,45,115,104,111,119), () => {
    if (authWindow) {
      authWindow.close();
      authWindow = null;
    }
    mainWindow.show();
    if (userData) {
      mainWindow.webContents.send(String.fromCharCode(117,115,101,114,45,100,97,116,97), userData);
    }
  });

  attachCloseHandler(mainWindow);

  mainWindow.on(String.fromCharCode(99,108,111,115,101,100), () => {
    mainWindow = null;
  });
}




ipcMain.on(String.fromCharCode(119,105,110,100,111,119,45,109,105,110), (event) => {
  console.log(String.fromCharCode(73,80,67,58,32,119,105,110,100,111,119,45,109,105,110,32,114,101,99,101,105,118,101,100));
  const win = BrowserWindow.fromWebContents(event.sender) || authWindow || mainWindow;
  if (win) {
    console.log(String.fromCharCode(73,80,67,58,32,77,105,110,105,109,105,122,105,110,103,32,119,105,110,100,111,119));
    win.minimize();
  } else {
    console.warn(String.fromCharCode(73,80,67,58,32,78,111,32,119,105,110,100,111,119,32,102,111,117,110,100,32,116,111,32,109,105,110,105,109,105,122,101));
  }
});

ipcMain.on(String.fromCharCode(119,105,110,100,111,119,45,109,97,120), (event) => {
  console.log(String.fromCharCode(73,80,67,58,32,119,105,110,100,111,119,45,109,97,120,32,114,101,99,101,105,118,101,100));
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) {
    if (win.isMaximized()) {
      console.log(String.fromCharCode(73,80,67,58,32,85,110,109,97,120,105,109,105,122,105,110,103,32,119,105,110,100,111,119));
      win.unmaximize();
    } else {
      console.log(String.fromCharCode(73,80,67,58,32,77,97,120,105,109,105,122,105,110,103,32,119,105,110,100,111,119));
      win.maximize();
    }
  }
});

ipcMain.on(String.fromCharCode(119,105,110,100,111,119,45,99,108,111,115,101), (event) => {
  console.log(String.fromCharCode(73,80,67,58,32,119,105,110,100,111,119,45,99,108,111,115,101,32,114,101,99,101,105,118,101,100));
  const win = BrowserWindow.fromWebContents(event.sender) || authWindow || mainWindow;
  if (win) win.webContents.send(String.fromCharCode(115,104,111,119,45,99,108,111,115,101,45,100,105,97,108,111,103));
});

ipcMain.on(String.fromCharCode(119,105,110,100,111,119,45,104,105,100,101,45,116,111,45,116,114,97,121), (event) => {
  console.log(String.fromCharCode(73,80,67,58,32,119,105,110,100,111,119,45,104,105,100,101,45,116,111,45,116,114,97,121,32,114,101,99,101,105,118,101,100));
  const win = BrowserWindow.fromWebContents(event.sender) || authWindow || mainWindow;
  if (win) hideToTray(win);
});

ipcMain.on(String.fromCharCode(119,105,110,100,111,119,45,113,117,105,116), () => {
  appIsQuitting = true;
  app.quit();
});

ipcMain.on(String.fromCharCode(97,117,116,104,45,115,117,99,99,101,115,115), (event, userData) => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  createMainWindow(userData);
});

ipcMain.on(String.fromCharCode(111,112,101,110,45,101,120,116,101,114,110,97,108), (event, url) => {
  shell.openExternal(url);
});

function pickBestGpu(controllers, displays = []) {
  controllers = controllers || [];
  if (controllers.length === 0 && Array.isArray(displays) && displays.length > 0) {
    controllers = displays.map((display) => ({
      model: display.model || display.vendor || String.fromCharCode(68,105,115,112,108,97,121,32,65,100,97,112,116,101,114),
      vendor: display.vendor || '',
      vram: 0,
      driverVersion: display.driver || display.driverVersion || ''
    }));
  }

  if (controllers.length === 0) {
    return {
      label: String.fromCharCode(73,110,116,101,103,114,97,116,101,100,32,71,114,97,112,104,105,99,115,32,40,78,111,32,100,105,115,99,114,101,116,101,32,71,80,85,32,100,101,116,101,99,116,101,100,41),
      list: []
    };
  }

  const scored = controllers.map((gpu) => {
    const model = (gpu.model || gpu.vendor || String.fromCharCode(85,110,107,110,111,119,110,32,71,80,85)).trim();
    const vramMb = gpu.vram || gpu.vramDynamic || 0;
    const lower = model.toLowerCase();
    let score = vramMb;

    if (/nvidia|geforce|rtx|gtx|quadro|tesla/.test(lower)) score += 50000;
    if (/amd|radeon|rx |vega|instinct/.test(lower)) score += 45000;
    if (/intel|uhd|iris|arc a/.test(lower)) score += 5000;
    if (/microsoft basic|virtual|parsec|remote|vmware|citrix|display only/.test(lower)) score -= 100000;

    if (/nvidia|amd|radeon|rtx|gtx|quadro|tesla|vega|instinct/.test(lower)) score += 8000;

    return {
      name: model,
      vramMb,
      vendor: gpu.vendor || '',
      driver: gpu.driverVersion || '',
      dedicated: /nvidia|amd|radeon|rtx|gtx|quadro|tesla|vega|instinct/.test(lower) || vramMb >= 1024,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  let label = best.name || String.fromCharCode(85,110,107,110,111,119,110,32,71,80,85);

  if (best.vramMb >= 1024) {
    label += ` · ${(best.vramMb / 1024).toFixed(1)} GB VRAM`;
  } else if (best.vramMb > 0) {
    label += ` · ${best.vramMb.toFixed(0)} MB VRAM`;
  }

  label += best.dedicated ? ' · Dedicated' : String.fromCharCode(32,183,32,73,110,116,101,103,114,97,116,101,100);

  if (best.vendor) {
    label += ` · ${best.vendor}`;
  }
  if (best.driver) {
    label += ` · Driver ${best.driver}`;
  }

  return { label, list: scored };
}

ipcMain.handle(String.fromCharCode(103,101,116,45,115,121,115,116,101,109,45,115,112,101,99,115), async () => {
  const cpus = os.cpus();
  const fallback = {
    cpu: cpus[0]?.model?.trim() || String.fromCharCode(85,110,107,110,111,119,110,32,67,80,85),
    gpu: String.fromCharCode(68,101,116,101,99,116,105,110,103,46,46,46),
    gpus: [],
    ram: `${(os.totalmem() / (1024 ** 3)).toFixed(1)} GB`,
    os: `${os.platform()} ${os.arch()} ${os.release()}`,
    cores: cpus.length,
    threads: cpus.length,
    hostname: os.hostname()
  };

  try {
    const [cpu, mem, graphics, osInfo] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.graphics(),
      si.osInfo()
    ]);

    const gpuInfo = pickBestGpu(graphics.controllers, graphics.displays);

    return {
      cpu: cpu.brand || fallback.cpu,
      gpu: gpuInfo.label,
      gpus: gpuInfo.list,
      ram: `${(mem.total / (1024 ** 3)).toFixed(1)} GB`,
      os: `${osInfo.platform} ${osInfo.arch} ${osInfo.release}`,
      cores: cpu.physicalCores || cpu.cores || fallback.cores,
      threads: cpu.cores || fallback.threads,
      hostname: os.hostname()
    };
  } catch (err) {
    console.error(String.fromCharCode(71,80,85,32,100,101,116,101,99,116,105,111,110,32,102,97,108,108,98,97,99,107,58), err.message);
    return fallback;
  }
});

function startOAuthServer() {
  if (oauthServer) return;

  const http = require('http');
  const url = require('url');

  oauthServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === String.fromCharCode(47,99,97,108,108,98,97,99,107)) {
      const access_token = parsedUrl.query.access_token;
      const refresh_token = parsedUrl.query.refresh_token;

      if (access_token) {
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.webContents.send(String.fromCharCode(111,97,117,116,104,45,115,117,99,99,101,115,115), { access_token, refresh_token });
        }

        res.writeHead(200, {
          'Content-Type': String.fromCharCode(116,101,120,116,47,104,116,109,108,59,32,99,104,97,114,115,101,116,61,117,116,102,45,56),
          'Access-Control-Allow-Origin': '*'
        });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Verdex Authentication</title>
            <style>
              body { background: #050a05; color: #00ff88; font-family: sans-serif; text-align: center; padding-top: 50px; }
              .card { display: inline-block; background: #0c1a0e; border: 1px solid #153018; border-radius: 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>✓ Authentication Successful</h2>
              <p>You can close this tab and return to the Verdex Miner app.</p>
            </div>
          </body>
          </html>
        `);
      } else {
        res.writeHead(400, { 'Content-Type': String.fromCharCode(116,101,120,116,47,104,116,109,108,59,32,99,104,97,114,115,101,116,61,117,116,102,45,56) });
        res.end(String.fromCharCode(60,104,50,62,65,117,116,104,32,70,97,105,108,101,100,58,32,77,105,115,115,105,110,103,32,97,99,99,101,115,115,32,116,111,107,101,110,60,47,104,50,62));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  oauthServer.listen(8420, String.fromCharCode(49,50,55,46,48,46,48,46,49), () => {
    console.log(String.fromCharCode(79,65,117,116,104,32,108,111,111,112,98,97,99,107,32,115,101,114,118,101,114,32,108,105,115,116,101,110,105,110,103,32,111,110,32,104,116,116,112,58,47,47,49,50,55,46,48,46,48,46,49,58,56,52,50,48));
  });
}




app.whenReady().then(() => {
  if (process.platform === String.fromCharCode(119,105,110,51,50)) {
    app.setAppUserModelId(String.fromCharCode(99,111,109,46,118,101,114,100,101,120,46,109,105,110,101,114));
  }
  createTray();
  startOAuthServer();
  createSplashWindow();
});

app.on(String.fromCharCode(98,101,102,111,114,101,45,113,117,105,116), () => {
  appIsQuitting = true;
});

app.on(String.fromCharCode(119,105,110,100,111,119,45,97,108,108,45,99,108,111,115,101,100), () => {
  if (oauthServer) oauthServer.close();
  if (process.platform !== String.fromCharCode(100,97,114,119,105,110) && appIsQuitting) {
    app.quit();
  }
});

app.on(String.fromCharCode(97,99,116,105,118,97,116,101), () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
  }
});
