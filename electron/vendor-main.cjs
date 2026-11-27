// Heaven Vendor: the developer's own app for managing customers, subscriptions and license keys.
// Runs only on the developer's machine (npm run vendor). The private signing key lives here and nowhere else.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Store } = require('./store.cjs');
const L = require('./license.cjs');

const TABLES = ['customers', 'licenses', 'payments', 'plans', 'settings'];
const PUBLIC_FILE = path.join(__dirname, 'license-public.cjs');

app.setName('Heaven Vendor');
app.setPath('userData', process.env.HEAVEN_VENDOR_DIR ? path.resolve(process.env.HEAVEN_VENDOR_DIR) : path.join(app.getPath('appData'), 'Heaven Vendor'));

let win; let store;
const keyFile = () => path.join(app.getPath('userData'), 'vendor-private-key.pem');

function ensureKeys() {
  if (!fs.existsSync(keyFile())) {
    const k = L.generateKeyPair();
    fs.writeFileSync(keyFile(), k.privateKey, { mode: 0o600 });
    store.setKV('public_key', k.publicKey);
  }
  if (!store.getKV('public_key')) {
    const pub = crypto.createPublicKey(fs.readFileSync(keyFile(), 'utf8')).export({ type: 'spki', format: 'pem' });
    store.setKV('public_key', pub);
  }
}
const privateKey = () => fs.readFileSync(keyFile(), 'utf8');

function builtInKey() {
  try { delete require.cache[require.resolve(PUBLIC_FILE)]; return require(PUBLIC_FILE); } catch { return null; }
}

function seed() {
  const s = store;
  s.seed('plans', { id: 'plan-basic', name: 'أساسية', type: 'subscription', price: 1000, active: true, description: 'جهاز واحد' });
  s.seed('plans', { id: 'plan-full', name: 'كاملة', type: 'subscription', price: 1500, active: true, description: 'أكتر من جهاز + مزامنة + صلاحيات' });
  s.seed('plans', { id: 'plan-buy', name: 'شراء نهائي', type: 'perpetual', price: 20000, support_months: 12, active: true, description: 'ترخيص دائم + سنة دعم وتحديثات' });
}

const today = () => L.dateOnly(Date.now());
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return L.dateOnly(new Date(y, m - 1 + n, Math.min(d, last)).getTime());
}

function issueKey(customer, extra = {}) {
  const plan = store.get('plans', customer.plan_id);
  const lid = crypto.randomUUID().slice(0, 8);
  const payload = {
    lid, cid: customer.id, customer: customer.name, venue: customer.venue || '', type: customer.type,
    plan: plan?.name || '', expires: customer.type === 'subscription' ? customer.expires_at : null,
    support_until: customer.type === 'perpetual' ? customer.support_until || null : null,
    // Days the customer's computer may run without reaching the internet (0 = no limit).
    offline_days: customer.offline_days ?? (customer.type === 'subscription' ? 14 : 0),
  };
  const key = L.signLicense(payload, privateKey());
  const rec = store.put('licenses', { customer_id: customer.id, key, lid, type: payload.type, expires: payload.expires, support_until: payload.support_until, ...extra });
  return { key, license: rec };
}

// ---------- license server (the vendor's own Supabase project) ----------
let session = null;
const serverCfg = () => store.getKV('server', { url: '', anonKey: '', email: '', password: '' });

async function sb(pathname, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const c = serverCfg();
  const h = { apikey: c.anonKey, 'Content-Type': 'application/json', ...headers };
  if (auth) h.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(`${c.url.replace(/\/+$/, '')}${pathname}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const e = new Error((data && (data.message || data.error_description || data.msg)) || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

async function login() {
  const c = serverCfg();
  if (session && session.expires_at - 60 > Date.now() / 1000) return;
  session = await sb('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: c.email, password: c.password } });
}

// Publishes a customer's latest key and signed suspend/resume status to the license server.
async function push(customer) {
  const c = serverCfg();
  if (!c.url || !c.anonKey) return { pushed: false, reason: 'no-server' };
  try {
    await login();
    const latest = store.list('licenses').filter((l) => l.customer_id === customer.id).sort((a, b) => b.created_at - a.created_at)[0];
    const status = L.signStatus({ cid: customer.id, revoked: customer.status === 'suspended', reason: customer.suspend_reason || '', at: Date.now() }, privateKey());
    await sb('/rest/v1/licenses', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: [{ cid: customer.id, key: latest?.key || null, status, updated_at: new Date().toISOString() }] });
    store.put('customers', { ...store.get('customers', customer.id), pushed_at: Date.now(), push_error: null });
    return { pushed: true };
  } catch (e) {
    if (e.status === 401) session = null;
    const msg = /fetch failed|ENOTFOUND|timeout|aborted/i.test(e.message) ? 'لا يوجد اتصال بالإنترنت' : e.message;
    store.put('customers', { ...store.get('customers', customer.id), push_error: msg });
    return { pushed: false, reason: msg };
  }
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

function registerIpc() {
  handle('v:list', (tbl) => store.list(tbl));
  handle('v:put', (tbl, obj) => store.put(tbl, obj));
  handle('v:remove', (tbl, id) => store.remove(tbl, id));

  // Subscription renewal: extend from today or from the current end date (whichever is later), record the payment, issue a key.
  handle('v:renew', async ({ customer_id, months, amount, method, date, note }) => {
    const c = store.get('customers', customer_id);
    if (!c) throw new Error('العميل غير موجود');
    const n = Math.max(1, Number(months) || 1);
    const from = c.expires_at && c.expires_at > today() ? c.expires_at : today();
    const updated = store.put('customers', { ...c, type: 'subscription', expires_at: addMonths(from, n), status: 'active', start_date: c.start_date || today() });
    const pay = Number(amount) > 0 ? store.put('payments', { customer_id, amount: Number(amount), months: n, kind: 'subscription', method: method || 'كاش', date: date || today(), note: note || '', period: `${from} → ${updated.expires_at}` }) : null;
    const issued = issueKey(updated, { reason: 'renewal' });
    return { customer: updated, payment: pay, ...issued, online: await push(updated) };
  });

  // One-time purchase.
  handle('v:sell', async ({ customer_id, amount, support_months, method, date, note }) => {
    const c = store.get('customers', customer_id);
    if (!c) throw new Error('العميل غير موجود');
    const support = Number(support_months) > 0 ? addMonths(today(), Number(support_months)) : null;
    const updated = store.put('customers', { ...c, type: 'perpetual', expires_at: null, support_until: support, status: 'active', start_date: c.start_date || today() });
    const pay = Number(amount) > 0 ? store.put('payments', { customer_id, amount: Number(amount), kind: 'purchase', method: method || 'كاش', date: date || today(), note: note || '' }) : null;
    const issued = issueKey(updated, { reason: 'purchase' });
    return { customer: updated, payment: pay, ...issued, online: await push(updated) };
  });

  // Paid support / updates renewal for a one-time purchase.
  handle('v:support', async ({ customer_id, months, amount, method, date }) => {
    const c = store.get('customers', customer_id);
    const from = c.support_until && c.support_until > today() ? c.support_until : today();
    const updated = store.put('customers', { ...c, support_until: addMonths(from, Number(months) || 12) });
    if (Number(amount) > 0) store.put('payments', { customer_id, amount: Number(amount), months: Number(months) || 12, kind: 'support', method: method || 'كاش', date: date || today(), note: '' });
    const issued = issueKey(updated, { reason: 'support' });
    return { customer: updated, ...issued, online: await push(updated) };
  });

  handle('v:issue', async (customer_id) => {
    const c = store.get('customers', customer_id);
    if (!c) throw new Error('العميل غير موجود');
    if (c.type === 'subscription' && !c.expires_at) throw new Error('حدد مدة الاشتراك الأول (تجديد)');
    const issued = issueKey(c, { reason: 'reissue' });
    return { ...issued, online: await push(c) };
  });

  handle('v:suspend', async ({ customer_id, suspended, reason }) => {
    const c = store.get('customers', customer_id);
    const updated = store.put('customers', { ...c, status: suspended ? 'suspended' : 'active', suspend_reason: suspended ? reason || '' : '' });
    return { customer: updated, online: await push(updated) };
  });
  handle('v:pushAll', async () => {
    let ok = 0; let fail = 0; let last = '';
    for (const c of store.list('customers')) { const r = await push(c); if (r.pushed) ok++; else { fail++; last = r.reason; } }
    return { ok, fail, error: last };
  });
  handle('v:server', () => { const c = serverCfg(); return { url: c.url, anonKey: c.anonKey, email: c.email, hasPassword: !!c.password }; });
  handle('v:setServer', async (cfg) => {
    const prev = serverCfg();
    store.setKV('server', { url: String(cfg.url || '').trim().replace(/\/+$/, ''), anonKey: String(cfg.anonKey || '').trim(), email: String(cfg.email || '').trim(), password: cfg.password || prev.password });
    session = null;
    await login(); // proves the settings work
    return true;
  });
  handle('v:saveKeyFile', async ({ key, name }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: `${String(name || 'license').replace(/[\\/:*?"<>|]/g, '')}.hvnkey`, filters: [{ name: 'Heaven License', extensions: ['hvnkey'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, `${key}\n`, 'utf8');
    return r.filePath;
  });
  handle('v:keyInfo', () => {
    const pub = store.getKV('public_key');
    const built = builtInKey();
    const builtKey = typeof built === 'string' ? built : built?.publicKey;
    const builtServer = typeof built === 'object' && built ? built.server?.url || '' : '';
    const srv = serverCfg();
    return {
      publicKey: pub, linked: !!builtKey && builtKey.trim() === pub.trim(), builtIn: !!builtKey,
      serverLinked: builtServer === (srv.url || ''), server: srv.url || '', canLink: !app.isPackaged, keyFile: keyFile(),
    };
  });
  // Puts this machine's public key into the client app's source, so the next build only accepts keys signed here.
  handle('v:link', () => {
    if (app.isPackaged) throw new Error('الربط بيتعمل من نسخة الكود بس');
    const pub = store.getKV('public_key');
    const srv = serverCfg();
    const cfg = { publicKey: pub, server: srv.url && srv.anonKey ? { url: srv.url, anonKey: srv.anonKey } : null };
    fs.writeFileSync(PUBLIC_FILE, `// License settings built into the customer app. Written by the vendor app on the developer's machine.\n// Commit this file. It holds only the PUBLIC key and the license server's public (anon) key;\n// the private signing key and the vendor password never leave the vendor app.\nmodule.exports = ${JSON.stringify(cfg, null, 2)};\n`);
    return true;
  });

  handle('v:exportBackup', async () => {
    const r = await dialog.showSaveDialog(win, { defaultPath: `heaven-vendor-backup-${today()}.json`, filters: [{ name: 'Backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify({ app: 'heaven-vendor', version: 1, exported_at: Date.now(), private_key: privateKey(), rows: store.exportAll() }), { mode: 0o600 });
    return r.filePath;
  });
  handle('v:importBackup', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const b = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (b.app !== 'heaven-vendor') throw new Error('الملف ده مش نسخة احتياطية لبرنامج العملاء');
    if (b.private_key) {
      fs.writeFileSync(keyFile(), b.private_key, { mode: 0o600 });
      store.setKV('public_key', crypto.createPublicKey(b.private_key).export({ type: 'spki', format: 'pem' }));
    }
    store.importAll(b.rows || []);
    return b.rows?.length || 0;
  });
  handle('file:save', async ({ defaultPath, content, filters }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath, filters });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, content, 'utf8');
    return r.filePath;
  });
  handle('v:info', () => ({ dataPath: app.getPath('userData'), version: app.getVersion() }));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    store = new Store(path.join(app.getPath('userData'), 'vendor.db'), TABLES);
    ensureKeys();
    seed();
    registerIpc();
    win = new BrowserWindow({
      width: 1360, height: 860, minWidth: 1100, minHeight: 700, title: 'Heaven Vendor — إدارة العملاء', backgroundColor: '#F6F0EB',
      autoHideMenuBar: true,
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 16 } } : {}),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    if (process.env.VITE_DEV_SERVER_URL) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}/vendor.html`);
    else win.loadFile(path.join(__dirname, '..', 'dist', 'vendor.html'));
  });
  app.on('window-all-closed', () => app.quit());
}
