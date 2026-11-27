// The permission catalogue and built-in roles. Shared by the main process (enforcement)
// and the renderer (role editor, hiding what a user cannot do) through IPC.

const GROUPS = [
  {
    id: 'bookings', label: 'الحجوزات',
    items: [
      ['bookings.view', 'عرض الحجوزات'],
      ['bookings.create', 'إضافة حجز'],
      ['bookings.edit', 'تعديل حجز وتغيير حالته'],
      ['bookings.delete', 'حذف حجز'],
      ['bookings.price_edit', 'كتابة سعر مختلف عن سعر الباكدج'],
      ['bookings.discount', 'عمل خصم على الحجز'],
      ['bookings.override_limit', 'تجاوز الحد الأقصى للحجوزات في نفس التوقيت'],
      ['payments.create', 'تسجيل دفعة أو عربون'],
      ['payments.refund', 'تسجيل استرداد للعميل'],
      ['payments.delete', 'حذف أو تعديل دفعة'],
    ],
  },
  {
    id: 'tickets', label: 'تذاكر الدخول',
    items: [
      ['tickets.sell', 'بيع تذاكر'],
      ['tickets.history', 'رؤية مبيعات باقي الموظفين'],
      ['tickets.delete', 'حذف عملية بيع'],
    ],
  },
  {
    id: 'cafe', label: 'الكافيه',
    items: [
      ['cafe.sell', 'استخدام الكاشير'],
      ['cafe.discount', 'عمل خصم على الطلب'],
      ['cafe.delete', 'حذف طلب'],
      ['cafe.accounts', 'رؤية حسابات الكافيه وأرباحه'],
    ],
  },
  {
    id: 'finance', label: 'الحسابات',
    items: [
      ['dashboard.financials', 'رؤية أرقام الدخل في الرئيسية'],
      ['finance.view_all', 'رؤية كل الحسابات والأرباح'],
      ['finance.expense', 'تسجيل مصروف'],
      ['finance.income', 'تسجيل إيراد إضافي'],
      ['finance.backdate', 'تسجيل عملية بتاريخ قديم'],
      ['finance.delete', 'حذف أو تعديل مصروف / إيراد'],
      ['finance.export', 'تصدير الحسابات Excel'],
    ],
  },
  {
    id: 'settings', label: 'الإدارة',
    items: [
      ['settings.general', 'إعدادات المكان والإيصال'],
      ['settings.catalog', 'الباكدجات والأسعار والمنيو'],
      ['settings.users', 'إدارة المستخدمين'],
      ['settings.roles', 'إدارة الصلاحيات والأدوار'],
      ['settings.sync', 'إعدادات المزامنة'],
      ['settings.backup', 'النسخ الاحتياطي والاسترجاع'],
      ['audit.view', 'سجل النشاط (مين عمل إيه)'],
    ],
  },
  {
    id: 'developer', label: 'المطور',
    developer: true,
    items: [
      ['dev.tools', 'أدوات المطور والصيانة'],
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items.map(([key]) => key));
const NON_DEV = ALL.filter((k) => !k.startsWith('dev.'));

const EMPLOYEE_DEFAULT = [
  'bookings.view', 'bookings.create', 'bookings.edit', 'payments.create',
  'tickets.sell', 'cafe.sell', 'finance.expense',
];

const BUILT_IN = {
  'role-developer': { id: 'role-developer', name: 'مطور', system: true, locked: true, permissions: ALL, description: 'الدعم الفني وصيانة البرنامج' },
  'role-admin': { id: 'role-admin', name: 'مدير', system: true, locked: true, permissions: NON_DEV, description: 'كل الصلاحيات ماعدا أدوات المطور' },
  'role-employee': { id: 'role-employee', name: 'موظف', system: true, locked: false, permissions: EMPLOYEE_DEFAULT, description: 'الاستقبال والكاشير' },
};

// Older data stored the role as 'admin' / 'employee'.
const LEGACY = { admin: 'role-admin', employee: 'role-employee', developer: 'role-developer' };
const roleIdOf = (user) => LEGACY[user?.role] || user?.role || 'role-employee';

module.exports = { GROUPS, ALL, NON_DEV, EMPLOYEE_DEFAULT, BUILT_IN, LEGACY, roleIdOf };
