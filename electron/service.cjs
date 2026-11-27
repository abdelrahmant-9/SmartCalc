// Business rules on top of the store: seeding, login, roles and permissions.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const brand = require('../brand.json');
const P = require('./permissions.cjs');
const L = require('./license.cjs');
const BUILT_IN = require('./license-public.cjs');
// Older builds stored just the public key string; newer ones also carry the license server address.
const LICENSE_CFG = typeof BUILT_IN === 'string' ? { publicKey: BUILT_IN } : BUILT_IN || {};

const CATALOG_TABLES = ['packages', 'extras', 'ticket_types', 'cafe_items'];

const DEFAULT_SETTINGS = {
  id: 'app',
  venueName: '',
  currency: 'ج.م',
  limitConcurrent: false,
  maxConcurrentBookings: 3,
  blockOverLimit: false,
  paymentMethods: ['كاش', 'فودافون كاش', 'إنستاباي', 'تحويل بنكي', 'فيزا'],
  expenseCategories: ['خامات كافيه', 'مرتبات', 'كهرباء ومياه', 'صيانة', 'زراعة وتنسيق', 'دعاية', 'أخرى'],
  incomeCategories: ['إيراد إضافي', 'أخرى'],
  receiptFooter: 'شكراً لزيارتكم',
  receiptPaper: '80mm',
  venuePhone: '01124545323',
  venueAddress: 'طريق شبين الكوم - قويسنا',
};

const LABEL = Object.fromEntries(P.GROUPS.flatMap((g) => g.items));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 32);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class Service {
  constructor(store, { publicKey = LICENSE_CFG.publicKey || null, server = LICENSE_CFG.server || null, now = () => Date.now() } = {}) {
    this.store = store;
    this.user = null;
    this.publicKey = publicKey;
    this.server = server;
    this.now = now;
    this.refreshClockFloor();
    this.keepHeavenBranding();
    if (!store.getKV('first_run')) store.setKV('first_run', now());
    this.seed();
  }

  // ---------- license ----------
  licenseKey() {
    // Synced with the other devices of the venue; the local copy covers a device that has not synced yet.
    // When both exist, the one issued last wins.
    const keys = [this.store.get('settings', 'license')?.key, this.store.getKV('license_key')].filter(Boolean);
    if (keys.length < 2 || !this.publicKey) return keys[0] || null;
    const issued = (k) => { try { return L.verifyLicense(k, this.publicKey).issued || 0; } catch { return -1; } };
    return keys.sort((x, y) => issued(y) - issued(x))[0];
  }

  // The newest moment we know has passed: saved records can't come from the future.
  refreshClockFloor() {
    this.clockFloor = this.store.db.prepare('SELECT MAX(updated_at) AS t FROM records').get()?.t || 0;
  }

  // "Now" that can't be moved backwards: the computer clock, the last time the app saw, the newest
  // saved record, and the last real time fetched from the internet, whichever is latest.
  effectiveNow() {
    const last = this.store.getKV('last_seen', 0);
    const now = Math.max(this.now(), last, this.clockFloor || 0, this.store.getKV('last_check', 0) || 0);
    if (now > last + 60000) this.store.setKV('last_seen', now);
    return now;
  }

  licenseStatus() {
    const tokens = [this.store.get('settings', 'license_status')?.status, this.store.getKV('license_status')].filter(Boolean);
    const all = tokens.map((t) => L.verifyStatus(t, this.publicKey)).filter(Boolean);
    return all.sort((x, y) => y.at - x.at)[0] || null;
  }

  license() {
    const now = this.effectiveNow();
    const checkin = {
      last: this.store.getKV('last_check') || this.store.getKV('activated_at') || this.store.getKV('first_run'),
      uptime: this.store.getKV('uptime_since_check', 0),
    };
    const st = L.evaluate({
      publicKey: this.publicKey, key: this.licenseKey(), firstRun: this.store.getKV('first_run'), now,
      status: this.publicKey ? this.licenseStatus() : null, checkin, uptimeTotal: this.store.getKV('uptime_total', 0),
    });
    return {
      ...st, trial_days: L.TRIAL_DAYS, grace_days: L.GRACE_DAYS, device_id: this.store.getKV('device_id') || null,
      last_online: this.store.getKV('last_check') || null, has_server: !!this.server?.url,
    };
  }

  // Called every minute while the app runs. Uses a monotonic timer, so changing the clock doesn't affect it.
  tick(ms) {
    this.store.setKV('uptime_total', this.store.getKV('uptime_total', 0) + ms);
    this.store.setKV('uptime_since_check', this.store.getKV('uptime_since_check', 0) + ms);
  }

  // Result of an online check: real time, and maybe a newer key or a suspend/resume from the vendor.
  recordOnline({ serverTime, key, status }) {
    if (serverTime) {
      this.store.setKV('last_check', Math.max(serverTime, this.store.getKV('last_check', 0)));
      this.store.setKV('uptime_since_check', 0);
    }
    let changed = false;
    if (this.publicKey && status) {
      const st = L.verifyStatus(status, this.publicKey);
      const cur = this.licenseStatus();
      if (st && (!cur || st.at > cur.at)) {
        this.store.setKV('license_status', status);
        this.store.put('settings', { id: 'license_status', status }, null);
        changed = true;
      }
    }
    if (this.publicKey && key) {
      try {
        const p = L.verifyLicense(key, this.publicKey);
        const curKey = this.licenseKey();
        const cur = curKey ? L.verifyLicense(curKey, this.publicKey) : null;
        if (!cur || (p.cid === cur.cid && (p.issued || 0) > (cur.issued || 0))) { this.storeKey(key, p, null); changed = true; }
      } catch { /* ignore anything that isn't signed by the vendor */ }
    }
    return { ...this.license(), changed };
  }

  storeKey(clean, p, userId) {
    this.store.setKV('license_key', clean);
    this.store.setKV('activated_at', this.effectiveNow());
    this.store.setKV('uptime_since_check', 0);
    // Written directly: renewing must work even while the app is read-only.
    this.store.put('settings', { id: 'license', key: clean, customer: p.customer, venue: p.venue }, userId);
  }

  // Customer id of the current key, used to ask the license server about it.
  licenseCid() {
    const k = this.licenseKey();
    if (!k || !this.publicKey) return null;
    try { return L.verifyLicense(k, this.publicKey).cid || null; } catch { return null; }
  }

  assertWritable() {
    const l = this.license();
    if (l.writable) return;
    const msg = {
      trial_ended: 'انتهت الفترة التجريبية — فعّل الترخيص من الإعدادات ← الترخيص',
      expired: 'الاشتراك منتهي — البرنامج للعرض فقط لحد ما يتجدد',
      invalid: 'مفتاح الترخيص غير صالح — تواصل مع الدعم الفني',
      suspended: 'الاشتراك موقوف من الدعم الفني — البرنامج للعرض فقط',
      checkin_required: 'لازم الجهاز يتصل بالإنترنت مرة للتحقق من الاشتراك — وصّل النت واضغط "تحقق الآن"',
    }[l.state] || 'البرنامج للعرض فقط';
    throw new Error(msg);
  }

  activateLicense(key) {
    const u = this.requireAny(['settings.general', 'dev.tools']);
    if (!this.publicKey) throw new Error('نظام الترخيص غير مفعّل في النسخة دي');
    const p = L.verifyLicense(key, this.publicKey);
    const clean = String(key).replace(/\s+/g, '');
    const curKey = this.licenseKey();
    let cur = null;
    try { cur = curKey ? L.verifyLicense(curKey, this.publicKey) : null; } catch { cur = null; }
    // Re-entering the same (or an older) key must not reset the offline counters.
    if (cur && cur.cid === p.cid && (p.issued || 0) <= (cur.issued || 0)) throw new Error('المفتاح ده مُفعّل بالفعل أو أقدم من الحالي');
    this.storeKey(clean, p, u.id);
    return this.license();
  }

  removeLicense() {
    const u = this.require('dev.tools');
    this.store.setKV('license_key', null);
    if (this.store.get('settings', 'license')) this.store.remove('settings', 'license', u.id);
    return this.license();
  }

  seed() {
    const s = this.store;
    // Fixed ids + updated_at 0: every device seeds identical rows, real edits always win on sync.
    s.seed('users', {
      id: 'seed-admin', name: 'المدير', username: 'admin', role: 'role-admin', active: true,
      password_hash: hashPassword('admin'), must_change_password: true,
    });
    // Technical-support account. Visible to the venue's admins, who can switch it off.
    s.seed('users', {
      id: 'seed-developer', name: 'المطور (الدعم الفني)', username: 'developer', role: 'role-developer', active: true,
      password_hash: hashPassword('developer'), must_change_password: true,
    });
    const stored = s.get('settings', 'app');
    s.seed('settings', DEFAULT_SETTINGS);
    // Older versions had three employee toggles in settings; carry them over into the employee role.
    const emp = new Set(P.EMPLOYEE_DEFAULT);
    if (stored) {
      if (stored.allowEmployeePriceEdit) emp.add('bookings.price_edit');
      if (stored.allowEmployeeDiscount) { emp.add('bookings.discount'); emp.add('cafe.discount'); }
      if (stored.allowEmployeeExpenses === false) emp.delete('finance.expense');
    }
    for (const r of Object.values(P.BUILT_IN)) {
      s.seed('roles', { ...r, permissions: r.id === 'role-employee' ? [...emp] : r.permissions });
    }
    s.seed('packages', { id: 'seed-pkg-1', name: 'سيشن ساعة', pricing_type: 'fixed', price: 1500, duration_minutes: 60, active: true, description: '' });
    s.seed('packages', { id: 'seed-pkg-2', name: 'سيشن ساعتين', pricing_type: 'fixed', price: 2500, duration_minutes: 120, active: true, description: '' });
    s.seed('packages', { id: 'seed-pkg-3', name: 'بالساعة', pricing_type: 'hourly', price: 1200, duration_minutes: 60, active: true, description: 'السعر لكل ساعة' });
    s.seed('packages', { id: 'seed-pkg-4', name: 'سعر خاص', pricing_type: 'custom', price: 0, duration_minutes: 60, active: true, description: 'يكتب السعر يدوياً' });
    s.seed('extras', { id: 'seed-extra-1', name: 'ساعة إضافية', price: 1000, active: true });
    s.seed('extras', { id: 'seed-extra-2', name: 'الروم (Room)', price: 500, active: true });
    s.seed('ticket_types', { id: 'seed-ticket-1', name: 'تذكرة دخول', price: 100, active: true });
    s.seed('ticket_types', { id: 'seed-ticket-2', name: 'تذكرة طفل', price: 50, active: true });
    const items = [
      ['قهوة تركي', 'مشروبات ساخنة', 40], ['نسكافيه', 'مشروبات ساخنة', 45], ['شاي', 'مشروبات ساخنة', 25],
      ['ليمون نعناع', 'مشروبات باردة', 50], ['مياه معدنية', 'مشروبات باردة', 15], ['كانز', 'مشروبات باردة', 30],
    ];
    items.forEach(([name, category, price], i) => s.seed('cafe_items', { id: `seed-cafe-${i + 1}`, name, category, price, active: true }));
  }

  // Heaven was the first venue, from before names and logos were settings: its logo was the app's.
  // Write it into Heaven's own settings once, so renaming the product doesn't change what Heaven sees.
  keepHeavenBranding() {
    if (this.store.getKV('brand_v2')) return;
    this.store.setKV('brand_v2', true);
    const s = this.store.get('settings', 'app');
    if (!s || s.venueLogo || !/^heaven$/i.test(String(s.venueName || '').trim())) return;
    const file = path.join(__dirname, 'legacy', 'heaven-logo.png');
    if (!fs.existsSync(file)) return;
    const logo = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    this.store.put('settings', { ...s, venueLogo: logo, venueTagline: s.venueTagline ?? 'LENS & LEAVES · CAPTURING BEAUTY' }, null);
  }

  // Shown on the login screen, so it needs no login.
  branding() {
    const s = this.settings();
    let venue = '';
    try { venue = this.licenseKey() && this.publicKey ? L.verifyLicense(this.licenseKey(), this.publicKey).venue || '' : ''; } catch { venue = ''; }
    return { name: s.venueName || venue || brand.shortName, tagline: s.venueTagline || '', logo: s.venueLogo || null, product: brand.productName };
  }

  settings() {
    return { ...DEFAULT_SETTINGS, ...(this.store.get('settings', 'app') || {}) };
  }

  // ---------- roles & permissions ----------
  roleOf(user) {
    const id = P.roleIdOf(user);
    const built = P.BUILT_IN[id];
    const stored = this.store.get('roles', id);
    if (built?.locked) return { ...built, ...(stored ? { name: stored.name } : {}), permissions: built.permissions };
    return stored || built || { id, name: 'بدون دور', permissions: [] };
  }

  permsOf(user) { return new Set(this.roleOf(user).permissions || []); }

  isDeveloper(user) { return P.roleIdOf(user) === 'role-developer'; }

  can(perm) { return !!this.user && this.permsOf(this.user).has(perm); }

  require(perm) {
    const u = this.requireUser();
    if (!this.permsOf(u).has(perm)) throw new Error(`ليس لديك صلاحية: ${LABEL[perm] || perm}`);
    return u;
  }

  requireAny(perms) {
    const u = this.requireUser();
    const mine = this.permsOf(u);
    if (!perms.some((p) => mine.has(p))) throw new Error('ليس لديك صلاحية لهذه العملية');
    return u;
  }

  catalogue() {
    return { groups: P.GROUPS.map((g) => ({ ...g, items: g.items.map(([key, label]) => ({ key, label })) })), builtIn: Object.keys(P.BUILT_IN) };
  }

  withAccess(u) {
    if (!u) return null;
    const role = this.roleOf(u);
    return { ...publicUser(u), role: P.roleIdOf(u), role_name: role.name, permissions: [...this.permsOf(u)], last_login: this.store.getKV(`last_login:${u.id}`)?.prev || null };
  }

  // ---------- auth ----------
  login(username, password) {
    const uname = String(username || '').trim().toLowerCase();
    const u = this.store.list('users').find((x) => String(x.username).toLowerCase() === uname);
    if (!u || !verifyPassword(password, u.password_hash)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    if (!u.active) throw new Error(this.isDeveloper(u) ? 'دخول الدعم الفني موقوف من إدارة المكان' : 'هذا الحساب موقوف، تواصل مع المدير');
    // Kept on this device only, so logging in does not create a record to sync.
    this.store.setKV(`last_login:${u.id}`, { prev: this.store.getKV(`last_login:${u.id}`)?.at || null, at: Date.now() });
    this.user = u;
    return this.withAccess(this.user);
  }

  logout() { this.user = null; }

  me() {
    if (!this.user) return null;
    // Refresh from store in case the record changed (e.g. via sync).
    const fresh = this.store.get('users', this.user.id);
    if (!fresh || !fresh.active) { this.user = null; return null; }
    this.user = fresh;
    return this.withAccess(fresh);
  }

  requireUser() {
    if (!this.user) throw new Error('يجب تسجيل الدخول أولاً');
    return this.user;
  }

  changePassword(oldPassword, newPassword) {
    const u = this.requireUser();
    if (!verifyPassword(oldPassword, u.password_hash)) throw new Error('كلمة المرور الحالية غير صحيحة');
    if (String(newPassword || '').length < 4) throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
    if (oldPassword === newPassword) throw new Error('اختر كلمة مرور مختلفة عن الحالية');
    this.user = this.store.put('users', { ...u, password_hash: hashPassword(newPassword), must_change_password: false, password_changed_at: Date.now() }, u.id);
    return this.withAccess(this.user);
  }

  updateProfile({ name, phone }) {
    const u = this.requireUser();
    if (!String(name || '').trim()) throw new Error('الاسم مطلوب');
    this.user = this.store.put('users', { ...u, name: String(name).trim(), phone: String(phone || '').trim() }, u.id);
    return this.withAccess(this.user);
  }

  // ---------- generic data access with permissions ----------
  list(tbl, opts) {
    this.requireUser();
    const rows = this.store.list(tbl, opts);
    return tbl === 'users' ? rows.map(publicUser) : rows;
  }

  get(tbl, id) {
    this.requireUser();
    const row = this.store.get(tbl, id);
    return tbl === 'users' ? publicUser(row) : row;
  }

  put(tbl, obj) {
    const u = this.requireUser();
    this.assertWritable();
    const existing = obj.id ? this.store.get(tbl, obj.id) : null;
    const has = (p) => this.permsOf(u).has(p);
    const need = (p) => { if (!has(p)) throw new Error(`ليس لديك صلاحية: ${LABEL[p] || p}`); };

    if (tbl === 'users') throw new Error('استخدم شاشة المستخدمين');
    if (tbl === 'roles') return this.saveRole(obj);
    if (tbl === 'settings') { need('settings.general'); if (obj.id === 'license' || obj.id === 'license_status') throw new Error('فعّل الترخيص من شاشة الترخيص'); }
    if (CATALOG_TABLES.includes(tbl)) need('settings.catalog');

    if (tbl === 'bookings') {
      need(existing ? 'bookings.edit' : 'bookings.create');
      const disc = Number(obj.discount) || 0;
      if (disc > 0 && disc !== (Number(existing?.discount) || 0)) need('bookings.discount');
    }
    if (tbl === 'payments') {
      need(existing ? 'payments.delete' : 'payments.create');
      if (Number(obj.amount) < 0) need('payments.refund');
    }
    if (tbl === 'ticket_sales') need(existing ? 'tickets.delete' : 'tickets.sell');
    if (tbl === 'cafe_orders') {
      need(existing ? 'cafe.delete' : 'cafe.sell');
      if ((Number(obj.discount) || 0) > 0 && !existing) need('cafe.discount');
    }
    if (tbl === 'transactions') {
      if (existing) need('finance.delete');
      else need(obj.type === 'in' ? 'finance.income' : 'finance.expense');
      if (obj.date && obj.date !== localToday() && obj.date !== existing?.date) need('finance.backdate');
    }
    return this.store.put(tbl, obj, u.id);
  }

  remove(tbl, id) {
    const u = this.requireUser();
    this.assertWritable();
    const perm = {
      bookings: 'bookings.delete', payments: 'payments.delete', ticket_sales: 'tickets.delete', cafe_orders: 'cafe.delete',
      transactions: 'finance.delete', users: 'settings.users', roles: 'settings.roles',
      packages: 'settings.catalog', extras: 'settings.catalog', ticket_types: 'settings.catalog', cafe_items: 'settings.catalog',
    }[tbl];
    if (!perm) throw new Error('لا يمكن حذف هذا العنصر');
    this.require(perm);
    if (tbl === 'users') {
      const target = this.store.get('users', id);
      if (id === u.id) throw new Error('لا يمكنك حذف حسابك الحالي');
      if (target && this.isDeveloper(target)) throw new Error('حساب الدعم الفني لا يُحذف، يمكنك إيقافه فقط');
    }
    if (tbl === 'roles') {
      if (P.BUILT_IN[id]) throw new Error('الأدوار الأساسية لا تُحذف');
      const used = this.store.list('users').filter((x) => P.roleIdOf(x) === id);
      if (used.length) throw new Error(`الدور مستخدم مع ${used.length} مستخدم، غيّر دورهم الأول`);
    }
    return this.store.remove(tbl, id, u.id);
  }

  saveRole(data) {
    const u = this.require('settings.roles');
    const name = String(data.name || '').trim();
    if (!name) throw new Error('اسم الدور مطلوب');
    const built = P.BUILT_IN[data.id];
    if (built?.locked) throw new Error('صلاحيات هذا الدور ثابتة ولا تتعدل');
    let perms = [...new Set((data.permissions || []).filter((k) => P.ALL.includes(k)))];
    if (!this.isDeveloper(u)) perms = perms.filter((k) => !k.startsWith('dev.'));
    // Nobody can hand out a permission they do not have themselves.
    const mine = this.permsOf(u);
    const extra = perms.filter((k) => !mine.has(k));
    if (extra.length) throw new Error(`لا يمكنك منح صلاحية ليست عندك: ${LABEL[extra[0]]}`);
    const existing = data.id ? this.store.get('roles', data.id) : null;
    return this.store.put('roles', { ...(existing || {}), id: data.id, name, description: String(data.description || ''), permissions: perms, system: !!built }, u.id);
  }

  saveUser(data) {
    const me = this.require('settings.users');
    const iAmDev = this.isDeveloper(me);
    const existing = data.id ? this.store.get('users', data.id) : null;

    // Admins may only switch the support account on or off.
    if (existing && this.isDeveloper(existing) && !iAmDev) {
      return publicUser(this.store.put('users', { ...existing, active: data.active !== false }, me.id));
    }

    const username = String(data.username || '').trim().toLowerCase();
    if (!username) throw new Error('اسم المستخدم مطلوب');
    if (username !== existing?.username && !/^[a-z0-9._-]{2,30}$/.test(username)) throw new Error('اسم الدخول بالإنجليزي فقط (حروف وأرقام بدون مسافات)');
    if (!String(data.name || '').trim()) throw new Error('الاسم مطلوب');
    const all = this.store.list('users');
    if (all.some((x) => x.username.toLowerCase() === username && x.id !== data.id)) throw new Error('اسم المستخدم مستخدم بالفعل');
    if (!existing && !data.password) throw new Error('كلمة المرور مطلوبة للمستخدم الجديد');

    const roleId = P.roleIdOf({ role: data.role });
    const role = this.roleOf({ role: roleId });
    if (!P.BUILT_IN[roleId] && !this.store.get('roles', roleId)) throw new Error('الدور غير موجود');
    if (roleId === 'role-developer' && !iAmDev) throw new Error('دور المطور يمنحه المطور فقط');
    const mine = this.permsOf(me);
    if (!iAmDev && (role.permissions || []).some((k) => !mine.has(k))) throw new Error('لا يمكنك إعطاء دور صلاحياته أكبر من صلاحياتك');
    if (existing && existing.id === me.id && (roleId !== P.roleIdOf(existing) || data.active === false)) {
      throw new Error('لا يمكنك تغيير دورك أو إيقاف حسابك الحالي');
    }

    const doc = {
      ...(existing || {}),
      id: data.id,
      name: String(data.name).trim(),
      username,
      role: roleId,
      active: data.active !== false,
      phone: String(data.phone || '').trim(),
    };
    if (data.password) {
      if (String(data.password).length < 4) throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      doc.password_hash = hashPassword(data.password);
      doc.must_change_password = true; // the person changes it on first login
    }
    return publicUser(this.store.put('users', doc, me.id));
  }

  // ---------- activity log ----------
  activity({ limit = 150, before = null, userId = null } = {}) {
    this.require('audit.view');
    const users = Object.fromEntries(this.store.list('users').map((x) => [x.id, x.name]));
    const rows = this.store.recent(userId ? 2000 : limit, before)
      .filter((r) => !userId || r.data.updated_by === userId)
      .slice(0, limit)
      .map((r) => ({
        key: `${r.tbl}:${r.id}:${r.updated_at}`,
        tbl: r.tbl, id: r.id, at: r.updated_at,
        action: r.deleted ? 'delete' : (r.data.created_at === r.data.updated_at ? 'create' : 'update'),
        user: users[r.data.updated_by] || '—',
        user_id: r.data.updated_by || null,
        summary: this.summarize(r.tbl, r.data),
      }));
    return rows;
  }

  summarize(tbl, d) {
    switch (tbl) {
      case 'bookings': return `${d.bride_name || ''}${d.date ? ` — \u2066${d.date}\u2069` : ''}`;
      case 'payments': return `${Number(d.amount) || 0} — ${d.method || ''}`;
      case 'ticket_sales': return `${(d.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0)} تذكرة — ${Number(d.total) || 0}`;
      case 'cafe_orders': return `طلب #${d.number || ''} — ${Number(d.total) || 0}`;
      case 'transactions': return `${d.type === 'in' ? 'إيراد' : 'مصروف'} ${Number(d.amount) || 0} — ${d.category || ''}`;
      case 'users': return `${d.name || ''} (${d.username || ''})`;
      case 'roles': return d.name || '';
      case 'settings': return 'إعدادات المكان';
      default: return d.name || '';
    }
  }
}

module.exports = { Service, hashPassword, verifyPassword, DEFAULT_SETTINGS };
