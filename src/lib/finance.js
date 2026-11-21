// Pure money logic shared by bookings, dashboard and reports.

export const BOOKING_STATUS = {
  pending: { label: 'مبدئي', tone: 'warn' },
  confirmed: { label: 'مؤكد', tone: 'info' },
  completed: { label: 'تم التصوير', tone: 'ok' },
  cancelled: { label: 'ملغي', tone: 'muted' },
  no_show: { label: 'لم يحضر', tone: 'danger' },
};

export const SECTION_LABELS = {
  bookings: 'الحجوزات',
  tickets: 'تذاكر الدخول',
  cafe: 'الكافيه',
  general: 'عام',
};

// Price for a booking given its package, hours and extras.
export function computeBookingPrice({ pkg, hours, extras, customPrice, discount }) {
  let base = 0;
  if (pkg) {
    if (pkg.pricing_type === 'hourly') base = (Number(pkg.price) || 0) * (Number(hours) || 1);
    else if (pkg.pricing_type === 'custom') base = Number(customPrice) || 0;
    else base = Number(pkg.price) || 0;
  }
  const extrasTotal = (extras || []).reduce((s, e) => s + (Number(e.price) || 0) * (Number(e.qty) || 1), 0);
  const subtotal = base + extrasTotal;
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  return { base, extrasTotal, subtotal, discount: disc, total: subtotal - disc };
}

export function paidFor(bookingId, payments) {
  return payments.filter((p) => p.booking_id === bookingId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

// Flatten every money movement into one list: { date, time, section, type, label, amount, method, user, ref }.
export function movements({ payments = [], ticketSales = [], cafeOrders = [], transactions = [], bookings = [] }) {
  const byId = Object.fromEntries(bookings.map((b) => [b.id, b]));
  const out = [];
  for (const p of payments) {
    const b = byId[p.booking_id];
    const amt = Number(p.amount) || 0;
    out.push({
      key: `p-${p.id}`, date: p.date, ts: p.created_at, section: 'bookings', type: amt >= 0 ? 'in' : 'out',
      label: `${amt >= 0 ? 'دفعة حجز' : 'استرداد حجز'}${b ? ` - ${b.bride_name}` : ''}`,
      amount: Math.abs(amt), method: p.method, user: p.created_by, category: amt >= 0 ? 'دفعة حجز' : 'استرداد',
    });
  }
  for (const t of ticketSales) {
    const qty = (t.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
    out.push({
      key: `t-${t.id}`, date: t.date, ts: t.created_at, section: 'tickets', type: 'in',
      label: `بيع ${qty} تذكرة`, amount: Number(t.total) || 0, method: t.method, user: t.created_by, category: 'تذاكر',
    });
  }
  for (const o of cafeOrders) {
    out.push({
      key: `c-${o.id}`, date: o.date, ts: o.created_at, section: 'cafe', type: 'in',
      label: `فاتورة كافيه #${o.number || ''}`.trim(), amount: Number(o.total) || 0, method: o.method, user: o.created_by, category: 'مبيعات الكافيه',
    });
  }
  for (const x of transactions) {
    out.push({
      key: `x-${x.id}`, date: x.date, ts: x.created_at, section: x.section || 'general', type: x.type,
      label: x.note || x.category || (x.type === 'in' ? 'إيراد' : 'مصروف'),
      amount: Number(x.amount) || 0, method: x.method, user: x.created_by, category: x.category || '',
    });
  }
  out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
  return out;
}

export function summarize(list) {
  const s = { in: 0, out: 0, bySection: {}, byMethod: {}, byUser: {}, byDay: {} };
  for (const m of list) {
    const sign = m.type === 'in' ? 1 : -1;
    s[m.type] += m.amount;
    const sec = (s.bySection[m.section] ||= { in: 0, out: 0 });
    sec[m.type] += m.amount;
    const method = m.method || 'كاش';
    s.byMethod[method] = (s.byMethod[method] || 0) + sign * m.amount;
    const u = (s.byUser[m.user || '-'] ||= { in: 0, out: 0 });
    u[m.type] += m.amount;
    const d = (s.byDay[m.date] ||= { in: 0, out: 0 });
    d[m.type] += m.amount;
  }
  s.net = s.in - s.out;
  return s;
}

// Do two bookings on the same day overlap in time?
export function overlaps(a, b) {
  if (a.date !== b.date) return false;
  const toMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
  const aS = toMin(a.start_time); const aE = aS + (Number(a.duration_minutes) || 60);
  const bS = toMin(b.start_time); const bE = bS + (Number(b.duration_minutes) || 60);
  return aS < bE && bS < aE;
}
