const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const si = require('systeminformation');

let oauthServer = null;
let splashWindow = null;
let authWindow = null;
let mainWindow = null;
let updateWindow = null;
let tray = null;
let appIsQuitting = false;
let isHiddenToTray = false;
let miningStatus = { active: false, hashrate: '0.0 MH/s', vp: 0 };
let pendingUserData = null;
let cachedUpdateInfo = null;
let updateSkippedThisSession = false;

const ICON_PATH = path.join(__dirname, 'assets', 'icon.ico');
const UPDATE_VERSION_URL = 'https://verdexswap.site/updates/version.json';
const UPDATE_FEED = 'https://verdexswap.site/updates';

function getAppIcon() {
  try {
    const img = nativeImage.createFromPath(ICON_PATH);
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  } catch {
    return nativeImage.createEmpty();
  }
}

function getActiveWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  if (authWindow && !authWindow.isDestroyed()) return authWindow;
  return null;
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed?.()) return;

  const miningLabel = miningStatus.active
    ? `Mining · ${miningStatus.hashrate} · ${miningStatus.vp} VP`
    : 'Standby · Not mining';

  tray.setToolTip(`Verdex Miner — ${miningLabel}`);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: miningStatus.active ? '● Mining Active' : '○ Standby',
      enabled: false
    },
    {
      label: `${miningStatus.hashrate}  ·  ${miningStatus.vp} VP`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Show Verdex Miner',
      click: () => showFromTray()
    },
    {
      label: miningStatus.active ? 'Keep mining in background' : 'Open & start mining',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard (Web)',
      click: () => shell.openExternal('https://verdexswap.site/dashboard')
    },
    {
      label: 'Open Swap',
      click: () => shell.openExternal('https://verdexswap.site/swap')
    },
    { type: 'separator' },
    {
      label: 'Quit Verdex',
      click: () => {
        appIsQuitting = true;
        destroyTray();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function destroyTray() {
  if (tray) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
}

function createTray() {
  if (tray) return;
  const icon = getAppIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  updateTrayMenu();

  tray.on('double-click', () => showFromTray());
  tray.on('click', () => {
    // Single click on Windows often feels better to restore
    if (process.platform === 'win32') showFromTray();
  });
}

function notifyBackground() {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: 'Verdex Miner',
      body: miningStatus.active
        ? 'Running in background — mining continues.'
        : 'Minimized to system tray. Double-click the tray icon to restore.',
      icon: ICON_PATH,
      silent: true
    });
    n.show();
  } catch (_) {}
}

/**
 * Hide window to tray without glitches:
 * - Tell renderer to pause animations first
 * - Unmaximize if needed (Windows frameless bug)
 * - Restore from minimized before hide
 * - skipTaskbar so it doesn't flash on taskbar
 */
function hideToTray(win) {
  if (!win || win.isDestroyed()) return;
  createTray();

  try {
    win.webContents.send('app-visibility', { visible: false, reason: 'tray' });
  } catch (_) {}

  // Let dialog CSS / rAF pause settle before hide (prevents white flash / glitch)
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    try {
      if (win.isMaximized()) win.unmaximize();
      if (win.isMinimized()) win.restore();
      win.setSkipTaskbar(true);
      win.hide();
      isHiddenToTray = true;
      updateTrayMenu();
      notifyBackground();
    } catch (err) {
      console.error('hideToTray error:', err.message);
    }
  }, 100);
}

function showFromTray() {
  const win = getActiveWindow();
  if (!win) {
    createSplashWindow();
    return;
  }

  try {
    win.setSkipTaskbar(false);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    isHiddenToTray = false;
    // Restore animations + redraw canvases after compositor settles
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.webContents.send('app-visibility', { visible: true, reason: 'tray' });
      }
    }, 60);
    updateTrayMenu();
  } catch (err) {
    console.error('showFromTray error:', err.message);
  }
}

function attachWindowLifecycle(win) {
  win.on('close', (e) => {
    if (appIsQuitting) return;
    e.preventDefault();
    // If already hidden to tray, ignore close spam
    if (isHiddenToTray && !win.isVisible()) return;
    try {
      win.webContents.send('show-close-dialog');
    } catch (_) {
      hideToTray(win);
    }
  });

  win.on('minimize', (e) => {
    // Optional: user preference could force tray — default stay taskbar minimize (stable)
    // Glitch fix: when minimized, pause heavy UI
    try {
      win.webContents.send('app-visibility', { visible: false, reason: 'minimize' });
    } catch (_) {}
  });

  win.on('restore', () => {
    try {
      win.webContents.send('app-visibility', { visible: true, reason: 'restore' });
    } catch (_) {}
  });

  win.on('show', () => {
    isHiddenToTray = false;
    try {
      win.setSkipTaskbar(false);
    } catch (_) {}
  });
}

// ═══════════════════════════════════════════════════════
// SPLASH
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
    minimizable: false,
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
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
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
    minimizable: true,
    backgroundColor: '#050a05',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true
    }
  });

  authWindow.loadFile('auth.html');
  authWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    if (authWindow && !authWindow.isDestroyed()) authWindow.show();
  });

  attachWindowLifecycle(authWindow);
  authWindow.on('closed', () => {
    authWindow = null;
  });
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
    resizable: true,
    minimizable: true,
    backgroundColor: '#07090f',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true
    }
  });

  mainWindow.loadFile('ui/index.html');

  mainWindow.once('ready-to-show', () => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.removeAllListeners('close');
      authWindow.close();
      authWindow = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      if (userData) {
        mainWindow.webContents.send('user-data', userData);
      }
    }
  });

  attachWindowLifecycle(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ═══════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════
function resolveWin(event) {
  return (
    BrowserWindow.fromWebContents(event.sender) ||
    BrowserWindow.getFocusedWindow() ||
    getActiveWindow()
  );
}

ipcMain.on('window-min', (event) => {
  const win = resolveWin(event);
  if (!win) return;
  // Taskbar minimize — stable path (not tray)
  try {
    win.webContents.send('app-visibility', { visible: false, reason: 'minimize' });
  } catch (_) {}
  win.minimize();
});

ipcMain.on('window-max', (event) => {
  const win = resolveWin(event);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window-close', (event) => {
  const win = resolveWin(event);
  if (win) {
    try {
      win.webContents.send('show-close-dialog');
    } catch (_) {}
  }
});

ipcMain.on('window-hide-to-tray', (event) => {
  const win = resolveWin(event);
  if (win) hideToTray(win);
});

ipcMain.on('window-quit', () => {
  appIsQuitting = true;
  destroyTray();
  app.quit();
});

ipcMain.on('window-show', () => {
  showFromTray();
});

ipcMain.on('mining-status', (event, status) => {
  miningStatus = {
    active: !!(status && status.active),
    hashrate: (status && status.hashrate) || '0.0 MH/s',
    vp: (status && status.vp) || 0
  };
  updateTrayMenu();
});

// ═══════════════════════════════════════════════════════
// AUTO-UPDATE (force prompt after login if outdated)
// ═══════════════════════════════════════════════════════
function isNewerVersion(remote, local) {
  const parse = (v) => String(v || '0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] || 0;
    const b = l[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 12000, headers: { 'Cache-Control': 'no-cache' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid version manifest'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Update check timed out'));
    });
  });
}

async function fetchRemoteVersion() {
  const info = await fetchJson(UPDATE_VERSION_URL + '?t=' + Date.now());
  const current = app.getVersion();
  const latest = info.version || info.latest || '0.0.0';
  const needsUpdate = isNewerVersion(latest, current);
  const winDl = (info.downloads && info.downloads.windows) || {};
  return {
    current,
    latest,
    needsUpdate,
    mandatory: info.mandatory !== false,
    notes: info.notes || 'Crystal logo, enhanced auth (Google + email/password), live network stats on login, UI polish, mining stability improvements, bug fixes.',
    downloadUrl: winDl.url || `${UPDATE_FEED}/Verdex-Miner-Setup-${latest}.exe`,
    fileName: winDl.fileName || `Verdex-Miner-Setup-${latest}.exe`,
    fileSize: winDl.size || 0,
    feedUrl: info.feedUrl || UPDATE_FEED
  };
}

function sendUpdateProgress(payload) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update-progress', payload);
  }
}

function createUpdateWindow(updateInfo) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }
  cachedUpdateInfo = updateInfo;
  updateWindow = new BrowserWindow({
    width: 500,
    height: 620,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#06090e',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  updateWindow.loadFile('update.html');
  updateWindow.once('ready-to-show', () => {
    if (authWindow && !authWindow.isDestroyed()) {
      try { authWindow.hide(); } catch (_) {}
    }
    updateWindow.show();
    updateWindow.focus();
  });
  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const lib = u.startsWith('https') ? https : http;
      const req = lib.get(u, { timeout: 120000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('Download failed HTTP ' + res.statusCode));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let transferred = 0;
        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          transferred += chunk.length;
          if (onProgress) {
            const percent = total ? (transferred / total) * 100 : 0;
            onProgress({ percent, transferred, total, status: 'downloading' });
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', (err) => {
          try { fs.unlinkSync(dest); } catch (_) {}
          reject(err);
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download timed out'));
      });
    };
    follow(url);
  });
}

async function startUpdateDownload() {
  if (!cachedUpdateInfo || !cachedUpdateInfo.downloadUrl) {
    throw new Error('No update package available');
  }
  const dest = path.join(app.getPath('temp'), cachedUpdateInfo.fileName || 'Verdex-Miner-Setup.exe');
  try {
    await downloadFile(cachedUpdateInfo.downloadUrl, dest, (p) => sendUpdateProgress(p));
    sendUpdateProgress({ percent: 100, status: 'installing' });
    // Launch NSIS installer then quit app so files can be replaced
    const child = spawn(dest, [], {
      detached: true,
      stdio: 'ignore',
      shell: true
    });
    child.unref();
    setTimeout(() => {
      appIsQuitting = true;
      app.quit();
    }, 800);
  } catch (err) {
    sendUpdateProgress({ status: 'error', message: err.message || String(err), percent: 0 });
    throw err;
  }
}

async function proceedAfterAuth(userData) {
  pendingUserData = userData || pendingUserData;
  // Already have main window → just show
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    if (pendingUserData) mainWindow.webContents.send('user-data', pendingUserData);
    return;
  }

  // Check for updates (skip only if user chose later on non-mandatory)
  try {
    if (!updateSkippedThisSession) {
      const info = await fetchRemoteVersion();
      cachedUpdateInfo = info;
      if (info.needsUpdate) {
        createUpdateWindow(info);
        return;
      }
    }
  } catch (err) {
    console.warn('Update check failed (continuing):', err.message);
  }

  createMainWindow(pendingUserData);
}

ipcMain.on('auth-success', (event, userData) => {
  proceedAfterAuth(userData).catch((err) => {
    console.error('auth-success flow failed:', err);
    createMainWindow(userData);
  });
});

ipcMain.handle('get-update-info', async () => {
  try {
    if (!cachedUpdateInfo) cachedUpdateInfo = await fetchRemoteVersion();
    return cachedUpdateInfo;
  } catch (e) {
    return {
      current: app.getVersion(),
      latest: app.getVersion(),
      needsUpdate: false,
      notes: e.message,
      mandatory: false
    };
  }
});

ipcMain.handle('start-update-download', async () => {
  await startUpdateDownload();
  return true;
});

ipcMain.on('skip-update', () => {
  updateSkippedThisSession = true;
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
    updateWindow = null;
  }
  createMainWindow(pendingUserData);
});

ipcMain.on('open-external', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
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

  if (best.vramMb >= 1024) label += ` · ${(best.vramMb / 1024).toFixed(1)} GB VRAM`;
  else if (best.vramMb > 0) label += ` · ${best.vramMb.toFixed(0)} MB VRAM`;
  label += best.dedicated ? ' · Dedicated' : ' · Integrated';
  if (best.vendor) label += ` · ${best.vendor}`;
  if (best.driver) label += ` · Driver ${best.driver}`;

  return { label, list: scored };
}

ipcMain.handle('get-app-version', async () => app.getVersion());

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
        res.end(`<!DOCTYPE html><html><head><title>Verdex Auth</title>
          <style>body{background:#050a05;color:#00ff88;font-family:system-ui;text-align:center;padding-top:60px}
          .card{display:inline-block;background:#0c1a0e;border:1px solid #153018;border-radius:12px;padding:28px}</style>
          </head><body><div class="card"><h2>✓ Signed in</h2><p>Return to Verdex Miner.</p></div></body></html>`);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Auth Failed</h2>');
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  oauthServer.listen(8420, '127.0.0.1', () => {
    console.log('OAuth loopback on http://127.0.0.1:8420');
  });
}

// ═══════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showFromTray();
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.verdex.miner');
    }
    createTray();
    startOAuthServer();
    createSplashWindow();
  });
}

app.on('before-quit', () => {
  appIsQuitting = true;
  destroyTray();
});

app.on('window-all-closed', () => {
  // Keep process alive when user hid to tray (no visible windows)
  if (appIsQuitting) {
    if (oauthServer) {
      try { oauthServer.close(); } catch (_) {}
    }
    if (process.platform !== 'darwin') app.quit();
  }
});

app.on('activate', () => {
  showFromTray();
});
