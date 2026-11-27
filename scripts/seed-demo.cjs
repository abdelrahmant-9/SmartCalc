// Builds a demo database with about a year of realistic data, for testing.
// Usage: npm run demo   (never touches the real data; it writes to ./demo-data)
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('../electron/store.cjs');
const { Service } = require('../electron/service.cjs');

const dir = path.resolve(process.argv[2] || 'demo-data');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const store = new Store(path.join(dir, 'heaven.db'));
const svc = new Service(store);
svc.login('admin', 'admin');

const DAYS_BACK = 365;
const DAYS_AHEAD = 60;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const dayAt = (offset) => { const d = new Date(now); d.setDate(d.getDate() + offset); return iso(d); };

let s = 20261123;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const t0 = Date.now();

// ---- people ----
const cashier = svc.put('roles', { name: 'كاشير', description: 'الكافيه والتذاكر بس', permissions: ['cafe.sell', 'tickets.sell', 'finance.expense'] });
const staff = [
  svc.saveUser({ name: 'سارة محمود', username: 'sara', password: '1234', role: 'employee', phone: '01098765432' }),
  svc.saveUser({ name: 'كريم حسن', username: 'karim', password: '1234', role: cashier.id, phone: '01155554444' }),
  svc.saveUser({ name: 'عبد الرحمن محمد عبد العزيز السيد الشرقاوي', username: 'abdo', password: '1234', role: 'employee' }),
  svc.saveUser({ name: 'مريم أشرف', username: 'mariam', password: '1234', role: 'admin' }),
];
const userIds = ['seed-admin', ...staff.map((u) => u.id)];
const cashiers = staff.slice(0, 3).map((u) => u.id);

// ---- catalog ----
store.put('packages', { name: 'باكدج التصوير الذهبي الكامل مع الروم والجنينة والبيت الخشب', pricing_type: 'fixed', price: 6500, duration_minutes: 240, active: true });
store.put('packages', { name: 'سيشن خطوبة', pricing_type: 'fixed', price: 1800, duration_minutes: 90, active: true });
store.put('extras', { name: 'تصوير درون فوق الجنينة', price: 2000, active: true });
store.put('extras', { name: 'كوشة وديكور ورد طبيعي حسب اختيار العروسة', price: 1500, active: true });
store.put('ticket_types', { name: 'تذكرة مرافق (VIP) مع مشروب', price: 175, active: true });
const menuSpec = [
  ['مشروبات ساخنة', [['قهوة تركي', 40], ['قهوة فرنساوي', 45], ['نسكافيه', 45], ['شاي', 25], ['شاي أخضر بالنعناع', 30], ['هوت شوكليت', 60], ['سبانش لاتيه بالكراميل المملح', 85]]],
  ['مشروبات باردة', [['ليمون نعناع', 50], ['موهيتو فراولة', 70], ['آيس كوفي', 65], ['Iced Caramel Macchiato with Oat Milk', 95], ['ميلك شيك فانيليا', 70], ['مياه معدنية', 15], ['كانز', 30]]],
  ['عصائر فريش', [['برتقال', 45], ['مانجو', 55], ['فراولة باللبن', 55], ['جوافة', 45], ['كوكتيل فواكه موسمية بدون سكر', 65]]],
  ['حلويات', [['كيكة شوكولاتة', 60], ['تشيز كيك', 75], ['كرواسون', 40], ['براونيز', 50]]],
  ['سناكس', [['شيبسي', 15], ['ساندوتش جبنة رومي', 45], ['بوب كورن', 25]]],
];
const menu = [];
for (const [category, items] of menuSpec) for (const [name, price] of items) menu.push(store.put('cafe_items', { name, category, price, active: true }));
// A few seeded items exist already; keep them active too.
menu.push(...store.list('cafe_items').filter((i) => i.id.startsWith('seed-')));

const packages = store.list('packages');
const extras = store.list('extras');
const tickets = store.list('ticket_types');

const brides = ['منة', 'ياسمين', 'نورهان', 'رنا', 'سلمى', 'هبة الله', 'مريم', 'دينا', 'آية', 'فرح', 'ملك', 'شهد', 'ندى', 'جنى', 'روان', 'لينا', 'حبيبة', 'بسنت', 'رحمة', 'إسراء', 'فاطمة الزهراء', 'Yasmine', 'Nour'];
const family = ['أحمد', 'محمد', 'محمود', 'عبد الرحمن', 'السيد', 'إبراهيم', 'خالد', 'مصطفى', 'عبد العزيز', 'الشرقاوي', 'الدسوقي', 'الشناوي', 'Elsayed', 'Abdelaziz'];
const grooms = ['محمد', 'أحمد', 'عمر', 'يوسف', 'كريم', 'مصطفى', 'إسلام', 'حازم', 'عبد الرحمن', 'زياد', 'بلال', 'مروان', 'خالد', 'سيف الدين', 'Ahmed', 'Omar'];
const fullName = (first) => {
  const n = rnd() < 0.15 ? 4 : rnd() < 0.5 ? 2 : 1; // some very long names
  return [first, ...Array.from({ length: n }, () => pick(family))].join(' ');
};
const photographers = ['', '', 'استوديو لحظات', 'Moments Studio', 'عدسة فرح', 'استوديو لحظات العمر للتصوير الفوتوغرافي والسينمائي', 'Noise Moments'];
const notes = ['', '', '', 'عايزين يصوروا عند البيت الخشب الأول', 'معاها 6 مرافقين', 'العروسة محتاجة الروم ساعة قبل السيشن للتجهيز والمكياج', 'هيجوا متأخر نص ساعة'];
const methods = ['كاش', 'كاش', 'كاش', 'فودافون كاش', 'إنستاباي'];

let count = { bookings: 0, payments: 0, ticket_sales: 0, cafe_orders: 0, transactions: 0 };
store.db.exec('BEGIN');
for (let k = -DAYS_BACK; k <= DAYS_AHEAD; k++) {
  const date = dayAt(k);
  const weekend = [4, 5].includes(new Date(date).getDay()); // Thu / Fri are busier
  const n = k === 0 ? 5 : int(0, weekend ? 7 : 3);
  for (let j = 0; j < n; j++) {
    const p = pick(packages);
    const hours = p.pricing_type === 'hourly' ? int(2, 4) : 1;
    const ex = rnd() < 0.3 ? [pick(extras)].map((e) => ({ id: e.id, name: e.name, price: e.price, qty: 1 })) : [];
    const base = p.pricing_type === 'hourly' ? p.price * hours : p.pricing_type === 'custom' ? int(15, 60) * 100 : p.price;
    const subtotal = base + ex.reduce((a, e) => a + e.price, 0);
    const discount = rnd() < 0.1 ? 200 : 0;
    const total = subtotal - discount;
    const status = k > 0 ? (rnd() < 0.8 ? 'confirmed' : 'pending') : k === 0 ? 'confirmed' : pick(['completed', 'completed', 'completed', 'completed', 'cancelled', 'no_show']);
    const startH = int(10, 18);
    const duration = p.pricing_type === 'hourly' ? hours * 60 : p.duration_minutes;
    const endM = startH * 60 + duration;
    const by = pick(userIds);
    const b = store.put('bookings', {
      bride_name: fullName(pick(brides)), groom_name: rnd() < 0.85 ? fullName(pick(grooms)) : '',
      phone: `01${pick(['0', '1', '2', '5'])}${String(int(10000000, 99999999))}`, phone2: '',
      date, start_time: `${pad(startH)}:${pick(['00', '30'])}`, end_time: `${pad(Math.floor(endM / 60) % 24)}:${pad(endM % 60)}`,
      duration_minutes: duration, package_id: p.id, package_name: p.name, pricing_type: p.pricing_type, package_price: p.price, hours,
      extras: ex, base_price: base, extras_total: subtotal - base, subtotal, discount, total, status,
      photographer: pick(photographers), guests: String(int(2, 10)), notes: pick(notes),
    }, by);
    count.bookings++;
    if (status !== 'cancelled') {
      const dep = Math.round((total * 0.4) / 100) * 100;
      store.put('payments', { booking_id: b.id, amount: dep, method: pick(methods), date: dayAt(Math.min(k, 0) - int(1, 20)), kind: 'deposit', note: '' }, by);
      count.payments++;
      if (status === 'completed') { store.put('payments', { booking_id: b.id, amount: total - dep, method: pick(methods), date, kind: 'payment', note: '' }, pick(cashiers)); count.payments++; }
    }
  }
  if (k > 0) continue;

  for (let j = 0, m = int(weekend ? 25 : 8, weekend ? 45 : 20); j < m; j++) {
    const items = [{ type_id: tickets[0].id, name: tickets[0].name, price: tickets[0].price, qty: int(1, 6) }];
    if (rnd() < 0.3) items.push({ type_id: tickets[1].id, name: tickets[1].name, price: tickets[1].price, qty: int(1, 3) });
    if (rnd() < 0.1 && tickets[2]) items.push({ type_id: tickets[2].id, name: tickets[2].name, price: tickets[2].price, qty: int(1, 2) });
    store.put('ticket_sales', { date, time: `${pad(int(10, 21))}:${pad(int(0, 59))}`, items, total: items.reduce((a, i) => a + i.price * i.qty, 0), method: pick(methods), note: '' }, pick(cashiers));
    count.ticket_sales++;
  }
  for (let j = 0, m = int(weekend ? 30 : 12, weekend ? 55 : 28); j < m; j++) {
    const items = Array.from({ length: int(1, 4) }, () => pick(menu)).map((it) => ({ item_id: it.id, name: it.name, price: it.price, qty: int(1, 3) }));
    const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
    const discount = rnd() < 0.05 ? 10 : 0;
    store.put('cafe_orders', { date, time: `${pad(int(10, 22))}:${pad(int(0, 59))}`, number: j + 1, items, subtotal, discount, total: subtotal - discount, method: pick(methods), note: rnd() < 0.1 ? `ترابيزة ${int(1, 20)}` : '' }, pick(cashiers));
    count.cafe_orders++;
  }
  const add = (type, section, category, amount, note) => { store.put('transactions', { date, type, section, category, amount, method: 'كاش', note }, pick(userIds)); count.transactions++; };
  if (rnd() < 0.35) add('out', 'cafe', 'خامات كافيه', int(3, 30) * 50, pick(['بن وسكر', 'لبن وعصاير', 'كانز ومياه', 'فواكه للعصاير الفريش من سوق العبور']));
  if (rnd() < 0.1) add('out', 'general', pick(['صيانة', 'زراعة وتنسيق', 'دعاية', 'أخرى']), int(4, 60) * 50, pick(['صيانة الإضاءة', 'ورد وزرع جديد', 'إعلان إنستجرام', 'أدوات نظافة']));
  if (date.endsWith('-01')) { add('out', 'general', 'مرتبات', 18000, 'مرتبات الشهر'); add('out', 'general', 'كهرباء ومياه', int(20, 40) * 100, ''); }
  if (rnd() < 0.03) add('in', 'general', 'إيراد إضافي', int(10, 50) * 100, 'تصوير إعلان لبراند');
}
store.db.exec('COMMIT');
// Demo data is local only: nothing here should be pushed to a sync server.
store.db.exec('UPDATE records SET dirty = 0');
// Demo passwords are known; do not nag about changing them.
for (const u of store.list('users')) store.db.prepare('UPDATE records SET data = ? WHERE tbl = ? AND id = ?').run(JSON.stringify({ ...u, must_change_password: false }), 'users', u.id);

const total = Object.values(count).reduce((a, b) => a + b, 0);
console.log(`Demo data ready in ${dir}`);
console.log(count, `total ${total} records in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('Logins: admin/admin (مدير) · developer/developer (مطور) · sara/1234 (موظف) · karim/1234 (كاشير) · abdo/1234 · mariam/1234 (مدير)');
