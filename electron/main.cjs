const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
const { Service } = require('./service.cjs');
const { Sync } = require('./sync.cjs');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let win = null;
let store, service, sync;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: process.env.HEAVEN_DEMO ? 'Heaven Manager — نسخة تجريبية' : 'Heaven Manager',
    backgroundColor: '#F6F0EB',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 16 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on('enter-full-screen', () => send('window:fullscreen', true));
  win.on('leave-full-screen', () => send('window:fullscreen', false));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// Wrap handlers so errors reach the UI as { ok:false, error } instead of noisy IPC exceptions.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });
}

function registerIpc() {
  handle('auth:login', (u, p) => service.login(u, p));
  handle('auth:logout', () => service.logout());
  handle('auth:me', () => service.me());
  handle('auth:changePassword', (o, n) => { const r = service.changePassword(o, n); sync.nudge(); return r; });

  handle('db:list', (tbl, opts) => service.list(tbl, opts));
  handle('db:get', (tbl, id) => service.get(tbl, id));
  handle('db:put', (tbl, obj) => { const r = service.put(tbl, obj); sync.nudge(); return r; });
  handle('db:remove', (tbl, id) => { const r = service.remove(tbl, id); sync.nudge(); return r; });
  handle('users:save', (data) => { const r = service.saveUser(data); sync.nudge(); return r; });
  handle('auth:catalogue', () => service.catalogue());
  handle('auth:updateProfile', (d) => { const r = service.updateProfile(d); sync.nudge(); return r; });
  handle('audit:list', (opts) => service.activity(opts));

  // ---------- developer tools ----------
  handle('dev:info', () => {
    service.require('dev.tools');
    const st = store.stats();
    return {
      version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome,
      sqlite: store.db.prepare('SELECT sqlite_version() AS v').get().v,
      platform: `${process.platform} ${process.arch}`, dataPath: app.getPath('userData'),
      deviceId: store.getKV('device_id'), syncCursor: store.getKV('sync_cursor', 0), sync: sync.getStatus(), ...st,
    };
  });
  handle('dev:action', async (action) => {
    service.require('dev.tools');
    if (action === 'devtools') { win.webContents.openDevTools({ mode: 'detach' }); return 'تم فتح أدوات المطور'; }
    if (action === 'resync-pull') { store.setKV('sync_cursor', 0); await sync.run(); return 'تمت إعادة سحب كل البيانات من السيرفر'; }
    if (action === 'resync-push') { store.markAllDirty(); await sync.run(); return 'تم تجهيز كل السجلات لإعادة الرفع'; }
    if (action === 'vacuum') { store.vacuum(); return 'تم ضغط قاعدة البيانات'; }
    if (action === 'reload') { win.webContents.reload(); return 'reload'; }
    if (action === 'open-data') { await shell.openPath(app.getPath('userData')); return 'تم فتح فولدر البيانات'; }
    throw new Error('أمر غير معروف');
  });

  handle('sync:getConfig', () => { service.require('settings.sync'); return sync.publicConfig(); });
  handle('sync:setConfig', (cfg) => { service.require('settings.sync'); return sync.setConfig(cfg); });
  handle('sync:status', () => sync.getStatus());
  handle('sync:now', async () => { await sync.run(); return sync.getStatus(); });

  handle('file:save', async ({ defaultPath, content, filters }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath, filters });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, content, 'utf8');
    return r.filePath;
  });

  handle('backup:export', async () => {
    service.require('settings.backup');
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `heaven-backup-${stamp}.json`, filters: [{ name: 'Backup', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify({ app: 'heaven-manager', version: 1, exported_at: Date.now(), rows: store.exportAll() }), 'utf8');
    return r.filePath;
  });

  handle('backup:import', async () => {
    service.require('settings.backup');
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const parsed = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (parsed.app !== 'heaven-manager' || !Array.isArray(parsed.rows)) throw new Error('ملف النسخة الاحتياطية غير صالح');
    store.importAll(parsed.rows);
    sync.nudge();
    return parsed.rows.length;
  });

  handle('app:info', () => ({ version: app.getVersion(), dataPath: app.getPath('userData'), demo: !!process.env.HEAVEN_DEMO }));
}

// A separate data folder (e.g. the demo copy) gets its own profile, so it can run next to the real app.
if (process.env.HEAVEN_DATA_DIR) app.setPath('userData', path.resolve(process.env.HEAVEN_DATA_DIR));

// Make sure only one copy runs so two windows never write the same database.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    const dataDir = app.getPath('userData');
    fs.mkdirSync(dataDir, { recursive: true });
    store = new Store(path.join(dataDir, 'heaven.db'));
    service = new Service(store);
    sync = new Sync(store, {
      onChange: () => send('data:changed'),
      onStatus: (s) => send('sync:status', s),
    });
    registerIpc();
    createWindow();
    sync.start();

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => {
    sync?.stop();
    if (process.platform !== 'darwin') app.quit();
  });
}
