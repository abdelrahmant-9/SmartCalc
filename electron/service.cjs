// Business rules on top of the store: seeding, login, and role-based permissions.
const crypto = require('node:crypto');

const ADMIN_ONLY_TABLES = ['users', 'settings', 'packages', 'extras', 'ticket_types', 'cafe_items'];
// Tables where an employee may create rows but never edit or delete them afterwards.
const APPEND_ONLY_FOR_EMPLOYEE = ['payments', 'ticket_sales', 'cafe_orders', 'transactions'];

const DEFAULT_SETTINGS = {
  id: 'app',
  venueName: 'Heaven',
  currency: 'ج.م',
  allowEmployeePriceEdit: false,
  allowEmployeeDiscount: false,
  allowEmployeeExpenses: true,
  maxConcurrentBookings: 3,
  paymentMethods: ['كاش', 'فودافون كاش', 'إنستاباي', 'تحويل بنكي', 'فيزا'],
  expenseCategories: ['خامات كافيه', 'مرتبات', 'كهرباء ومياه', 'صيانة', 'زراعة وتنسيق', 'دعاية', 'أخرى'],
  incomeCategories: ['إيراد إضافي', 'أخرى'],
  receiptFooter: 'شكراً لزيارتكم - Heaven',
};

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

class Service {
  constructor(store) {
    this.store = store;
    this.user = null;
    this.seed();
  }

  seed() {
    const s = this.store;
    // Fixed ids + updated_at 0: every device seeds identical rows, real edits always win on sync.
    s.seed('users', {
      id: 'seed-admin', name: 'المدير', username: 'admin', role: 'admin', active: true,
      password_hash: hashPassword('admin'), must_change_password: true,
    });
    s.seed('settings', DEFAULT_SETTINGS);
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

  settings() {
    return { ...DEFAULT_SETTINGS, ...(this.store.get('settings', 'app') || {}) };
  }

  // ---------- auth ----------
  login(username, password) {
    const uname = String(username || '').trim().toLowerCase();
    const u = this.store.list('users').find((x) => String(x.username).toLowerCase() === uname);
    if (!u || !verifyPassword(password, u.password_hash)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    if (!u.active) throw new Error('هذا الحساب موقوف، تواصل مع المدير');
    this.user = u;
    return publicUser(u);
  }

  logout() { this.user = null; }

  me() {
    if (!this.user) return null;
    // Refresh from store in case the record changed (e.g. via sync).
    const fresh = this.store.get('users', this.user.id);
    if (!fresh || !fresh.active) { this.user = null; return null; }
    this.user = fresh;
    return publicUser(fresh);
  }

  requireUser() {
    if (!this.user) throw new Error('يجب تسجيل الدخول أولاً');
    return this.user;
  }

  requireAdmin() {
    const u = this.requireUser();
    if (u.role !== 'admin') throw new Error('هذه العملية متاحة للمدير فقط');
    return u;
  }

  changePassword(oldPassword, newPassword) {
    const u = this.requireUser();
    if (!verifyPassword(oldPassword, u.password_hash)) throw new Error('كلمة المرور الحالية غير صحيحة');
    if (String(newPassword || '').length < 4) throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
    this.user = this.store.put('users', { ...u, password_hash: hashPassword(newPassword), must_change_password: false }, u.id);
    return publicUser(this.user);
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
    if (tbl === 'users') throw new Error('استخدم شاشة المستخدمين');
    if (u.role !== 'admin') {
      if (ADMIN_ONLY_TABLES.includes(tbl)) throw new Error('هذه العملية متاحة للمدير فقط');
      const exists = obj.id && this.store.get(tbl, obj.id);
      if (exists && APPEND_ONLY_FOR_EMPLOYEE.includes(tbl)) throw new Error('لا يمكن تعديل هذه العملية بعد حفظها، تواصل مع المدير');
      if (tbl === 'transactions' && obj.type === 'out' && !this.settings().allowEmployeeExpenses) {
        throw new Error('تسجيل المصروفات غير مسموح للموظف');
      }
    }
    return this.store.put(tbl, obj, u.id);
  }

  remove(tbl, id) {
    const u = this.requireAdmin();
    if (tbl === 'users' && id === u.id) throw new Error('لا يمكنك حذف حسابك الحالي');
    if (tbl === 'settings') throw new Error('لا يمكن حذف الإعدادات');
    return this.store.remove(tbl, id, u.id);
  }

  saveUser(data) {
    const admin = this.requireAdmin();
    const username = String(data.username || '').trim().toLowerCase();
    if (!username) throw new Error('اسم المستخدم مطلوب');
    if (!data.name) throw new Error('الاسم مطلوب');
    const all = this.store.list('users');
    if (all.some((x) => x.username.toLowerCase() === username && x.id !== data.id)) throw new Error('اسم المستخدم مستخدم بالفعل');
    const existing = data.id ? this.store.get('users', data.id) : null;
    if (!existing && !data.password) throw new Error('كلمة المرور مطلوبة للمستخدم الجديد');
    if (existing && existing.id === admin.id && (data.role !== 'admin' || data.active === false)) {
      throw new Error('لا يمكنك إلغاء صلاحية المدير أو إيقاف حسابك الحالي');
    }
    const doc = {
      ...(existing || {}),
      id: data.id,
      name: data.name,
      username,
      role: data.role === 'admin' ? 'admin' : 'employee',
      active: data.active !== false,
      phone: data.phone || '',
    };
    if (data.password) {
      if (String(data.password).length < 4) throw new Error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      doc.password_hash = hashPassword(data.password);
      doc.must_change_password = false;
    }
    return publicUser(this.store.put('users', doc, admin.id));
  }
}

module.exports = { Service, hashPassword, verifyPassword, DEFAULT_SETTINGS };
