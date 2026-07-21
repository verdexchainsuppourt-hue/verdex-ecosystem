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

const ICON_PATH = path.join(__dirname, 'assets', 'icon.ico');

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
  tray.setToolTip('Verdex Miner — Running in background');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Verdex Miner',
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
    { type: 'separator' },
    {
      label: 'Quit Verdex',
      click: () => {
        appIsQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
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
  win.on('close', (e) => {
    if (appIsQuitting) return;
    e.preventDefault();
    win.webContents.send('show-close-dialog');
  });
}

// ═══════════════════════════════════════════════════════
// SPLASH — single cinematic video, no duplicate overlays
// ═══════════════════════════════════════════════════════
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 680,
    height: 460,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    skipTaskbar: true,
    center: true,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile('splash.html');
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
    setTimeout(() => {
      createAuthWindow();
    }, 3200);
  });
}

// ═══════════════════════════════════════════════════════
// AUTH WINDOW
// ═══════════════════════════════════════════════════════
function createAuthWindow() {
  authWindow = new BrowserWindow({
    width: 960,
    height: 680,
    frame: false,
    show: false,
    center: true,
    resizable: false,
    backgroundColor: '#050a05',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  authWindow.loadFile('auth.html');
  authWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    authWindow.show();
  });

  attachCloseHandler(authWindow);
}

// ═══════════════════════════════════════════════════════
// MAIN WINDOW
// ═══════════════════════════════════════════════════════
function createMainWindow(userData) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    show: false,
    center: true,
    backgroundColor: '#0b0d17',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('ui/index.html');

  mainWindow.once('ready-to-show', () => {
    if (authWindow) {
      authWindow.close();
      authWindow = null;
    }
    mainWindow.show();
    if (userData) {
      mainWindow.webContents.send('user-data', userData);
    }
  });

  attachCloseHandler(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ═══════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════
ipcMain.on('window-min', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-max', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.webContents.send('show-close-dialog');
});

ipcMain.on('window-hide-to-tray', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) hideToTray(win);
});

ipcMain.on('window-quit', () => {
  appIsQuitting = true;
  app.quit();
});

ipcMain.on('auth-success', (event, userData) => {
  createMainWindow(userData);
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

function pickBestGpu(controllers, displays = []) {
  controllers = controllers || [];
  if (controllers.length === 0 && Array.isArray(displays) && displays.length > 0) {
    controllers = displays.map((display) => ({
      model: display.model || display.vendor || 'Display Adapter',
      vendor: display.vendor || '',
      vram: 0,
      driverVersion: display.driver || display.driverVersion || ''
    }));
  }

  if (controllers.length === 0) {
    return {
      label: 'Integrated Graphics (No discrete GPU detected)',
      list: []
    };
  }

  const scored = controllers.map((gpu) => {
    const model = (gpu.model || gpu.vendor || 'Unknown GPU').trim();
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
  let label = best.name || 'Unknown GPU';

  if (best.vramMb >= 1024) {
    label += ` · ${(best.vramMb / 1024).toFixed(1)} GB VRAM`;
  } else if (best.vramMb > 0) {
    label += ` · ${best.vramMb.toFixed(0)} MB VRAM`;
  }

  label += best.dedicated ? ' · Dedicated' : ' · Integrated';

  if (best.vendor) {
    label += ` · ${best.vendor}`;
  }
  if (best.driver) {
    label += ` · Driver ${best.driver}`;
  }

  return { label, list: scored };
}

ipcMain.handle('get-system-specs', async () => {
  const cpus = os.cpus();
  const fallback = {
    cpu: cpus[0]?.model?.trim() || 'Unknown CPU',
    gpu: 'Detecting...',
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
    console.error('GPU detection fallback:', err.message);
    return fallback;
  }
});

function startOAuthServer() {
  if (oauthServer) return;

  const http = require('http');
  const url = require('url');

  oauthServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/callback') {
      const access_token = parsedUrl.query.access_token;
      const refresh_token = parsedUrl.query.refresh_token;

      if (access_token) {
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.webContents.send('oauth-success', { access_token, refresh_token });
        }

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
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
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Auth Failed: Missing access token</h2>');
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  oauthServer.listen(8420, '127.0.0.1', () => {
    console.log('OAuth loopback server listening on http://127.0.0.1:8420');
  });
}

// ═══════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.verdex.miner');
  }
  createTray();
  startOAuthServer();
  createSplashWindow();
});

app.on('before-quit', () => {
  appIsQuitting = true;
});

app.on('window-all-closed', () => {
  if (oauthServer) oauthServer.close();
  if (process.platform !== 'darwin' && appIsQuitting) {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
  }
});
