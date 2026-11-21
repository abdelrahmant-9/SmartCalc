import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import {
  addDays, durationLabel, endOfMonth, minutesOf, money, MONTHS, prettyDate, startOfMonth, time12,
  timeFromMinutes, today, toISODate, WEEK_DAYS_FROM_SAT,
} from '../lib/format.js';
import { BOOKING_STATUS, computeBookingPrice, overlaps, paidFor } from '../lib/finance.js';
import { printReceipt } from '../lib/print.js';
import {
  Confirm, Empty, Field, MethodSelect, Modal, MoneyInput, PageHead, StatusBadge, Tabs,
} from '../components/ui.jsx';

export const bookingCode = (b) => (b?.id || '').replace(/^seed-/, '').slice(0, 6).toUpperCase();

export default function Bookings() {
  const { currency } = useApp();
  const [view, setView] = useState('calendar');
  const [month, setMonth] = useState(startOfMonth());
  const [selectedDay, setSelectedDay] = useState(today());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(null); // booking object or {} for new
  const [openId, setOpenId] = useState(null);

  const [bookings] = useData('bookings');
  const [payments] = useData('payments');

  const visible = useMemo(() => bookings.filter((b) => {
    if (status === 'active' && ['cancelled', 'no_show'].includes(b.status)) return false;
    if (status !== 'active' && status !== 'all' && b.status !== status) return false;
    if (!search) return true;
    const q = search.trim();
    return [b.bride_name, b.groom_name, b.phone, b.phone2, bookingCode(b)].some((v) => String(v || '').includes(q.toUpperCase()) || String(v || '').includes(q));
  }), [bookings, search, status]);

  const byDay = useMemo(() => {
    const m = {};
    for (const b of visible) (m[b.date] ||= []).push(b);
    Object.values(m).forEach((l) => l.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));
    return m;
  }, [visible]);

  const openBooking = bookings.find((b) => b.id === openId);

  return (
    <>
      <PageHead title="حجوزات العرائس" sub="المواعيد والعربون والمتبقي">
        <input className="search" placeholder="بحث بالاسم أو التليفون أو الكود…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">الحجوزات الفعالة</option>
          <option value="all">كل الحالات</option>
          {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setEditing({ date: selectedDay })}>+ حجز جديد</button>
      </PageHead>

      <Tabs tabs={[{ id: 'calendar', label: 'التقويم' }, { id: 'list', label: 'القائمة' }]} value={view} onChange={setView} />

      {view === 'calendar' ? (
        <div className="cal-layout">
          <MonthCalendar month={month} setMonth={setMonth} byDay={byDay} selected={selectedDay} onSelect={setSelectedDay} />
          <div className="card day-panel">
            <div className="row-between">
              <h3>{prettyDate(selectedDay)}</h3>
              <button className="btn btn-sm" onClick={() => setEditing({ date: selectedDay })}>+ حجز</button>
            </div>
            {(byDay[selectedDay] || []).length === 0 ? <Empty>لا توجد حجوزات في هذا اليوم</Empty> : (
              <div className="day-list">
                {byDay[selectedDay].map((b) => (
                  <BookingRow key={b.id} b={b} paid={paidFor(b.id, payments)} currency={currency} onClick={() => setOpenId(b.id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <BookingTable bookings={visible} payments={payments} currency={currency} onOpen={setOpenId} />
      )}

      {editing && (
        <BookingForm
          initial={editing}
          allBookings={bookings}
          onClose={() => setEditing(null)}
          onSaved={(b) => { setEditing(null); setOpenId(b.id); setSelectedDay(b.date); setMonth(startOfMonth(b.date)); }}
        />
      )}
      {openBooking && !editing && (
        <BookingDetail
          booking={openBooking}
          payments={payments.filter((p) => p.booking_id === openBooking.id)}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(openBooking)}
        />
      )}
    </>
  );
}

function BookingRow({ b, paid, currency, onClick }) {
  const remaining = (Number(b.total) || 0) - paid;
  return (
    <button className="booking-row" onClick={onClick}>
      <div className="booking-time">{time12(b.start_time)}<small>{durationLabel(b.duration_minutes)}</small></div>
      <div className="booking-main">
        <div className="booking-names">{b.bride_name}{b.groom_name ? ` & ${b.groom_name}` : ''}</div>
        <div className="muted small">{b.package_name} · {b.phone}</div>
      </div>
      <div className="booking-side">
        <StatusBadge status={b.status} />
        <div className={`small ${remaining > 0 ? 'text-danger' : 'text-ok'}`}>{remaining > 0 ? `متبقي ${money(remaining, currency)}` : 'خالص'}</div>
      </div>
    </button>
  );
}

function MonthCalendar({ month, setMonth, byDay, selected, onSelect }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 1) % 7; // Saturday-first grid
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(y, m - 1, d)));
  while (cells.length % 7) cells.push(null);
  const t = today();

  return (
    <div className="card calendar">
      <div className="row-between cal-head">
        <button className="btn btn-sm" onClick={() => setMonth(startOfMonth(addDays(month, -1)))}>→ السابق</button>
        <h3>{MONTHS[m - 1]} {y}</h3>
        <div className="row">
          <button className="btn btn-sm" onClick={() => { setMonth(startOfMonth()); onSelect(today()); }}>اليوم</button>
          <button className="btn btn-sm" onClick={() => setMonth(startOfMonth(addDays(endOfMonth(month), 1)))}>التالي ←</button>
        </div>
      </div>
      <div className="cal-grid">
        {WEEK_DAYS_FROM_SAT.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} className="cal-cell empty" />;
          const list = byDay[iso] || [];
          return (
            <button key={iso} className={`cal-cell ${iso === selected ? 'selected' : ''} ${iso === t ? 'today' : ''}`} onClick={() => onSelect(iso)}>
              <span className="cal-num">{Number(iso.slice(8))}</span>
              {list.slice(0, 3).map((b) => (
                <span key={b.id} className={`cal-chip chip-${b.status}`}>{time12(b.start_time)} {b.bride_name}</span>
              ))}
              {list.length > 3 && <span className="cal-more">+{list.length - 3} أخرى</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BookingTable({ bookings, payments, currency, onOpen }) {
  const rows = [...bookings].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.start_time || '').localeCompare(b.start_time || ''));
  if (!rows.length) return <Empty>لا توجد حجوزات</Empty>;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr><th>الكود</th><th>التاريخ</th><th>الوقت</th><th>العروسة</th><th>التليفون</th><th>الباكدج</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const paid = paidFor(b.id, payments);
            const rem = (Number(b.total) || 0) - paid;
            return (
              <tr key={b.id} className="clickable" onClick={() => onOpen(b.id)}>
                <td className="mono">{bookingCode(b)}</td>
                <td>{b.date}</td>
                <td>{time12(b.start_time)}</td>
                <td>{b.bride_name}{b.groom_name ? ` & ${b.groom_name}` : ''}</td>
                <td className="mono">{b.phone}</td>
                <td>{b.package_name}</td>
                <td>{money(b.total, currency)}</td>
                <td>{money(paid, currency)}</td>
                <td className={rem > 0 ? 'text-danger' : 'text-ok'}>{money(rem, currency)}</td>
                <td><StatusBadge status={b.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BookingForm({ initial, allBookings, onClose, onSaved }) {
  const { settings, isAdmin, currency, toast } = useApp();
  const act = useAction();
  const [packages] = useData('packages');
  const [extrasList] = useData('extras');
  const activePackages = packages.filter((p) => p.active || p.id === initial.package_id);
  const isNew = !initial.id;

  const [f, setF] = useState(() => ({
    bride_name: '', groom_name: '', phone: '', phone2: '', date: today(), start_time: '16:00',
    duration_minutes: 60, package_id: '', hours: 1, custom_price: 0, extras: [], discount: 0,
    status: 'confirmed', photographer: '', guests: '', notes: '', price_override: '',
    deposit: '', deposit_method: (settings.paymentMethods || ['كاش'])[0],
    ...initial,
  }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  // Editing keeps the price the booking was made with, unless the package is changed.
  const snapshot = f.package_id && f.package_id === initial.package_id
    ? { id: f.package_id, name: initial.package_name, pricing_type: initial.pricing_type, price: initial.package_price }
    : null;
  const pkg = snapshot || packages.find((p) => p.id === f.package_id);

  const canEditPrice = isAdmin || settings.allowEmployeePriceEdit;
  const canDiscount = isAdmin || settings.allowEmployeeDiscount;
  const price = computeBookingPrice({ pkg, hours: f.hours, extras: f.extras, customPrice: f.custom_price, discount: canDiscount ? f.discount : 0 });
  const finalTotal = canEditPrice && f.price_override !== '' && f.price_override !== null ? Number(f.price_override) : price.total;

  const choosePackage = (id) => {
    const p = packages.find((x) => x.id === id);
    setF((x) => ({
      ...x, package_id: id,
      duration_minutes: p ? (p.pricing_type === 'hourly' ? 60 * (Number(x.hours) || 1) : Number(p.duration_minutes) || 60) : x.duration_minutes,
    }));
  };

  const toggleExtra = (e) => {
    const has = f.extras.some((x) => x.id === e.id);
    set('extras', has ? f.extras.filter((x) => x.id !== e.id) : [...f.extras, { id: e.id, name: e.name, price: e.price, qty: 1 }]);
  };

  const conflicts = allBookings.filter((b) => b.id !== f.id && !['cancelled', 'no_show'].includes(b.status) && overlaps(b, f));
  const maxConcurrent = Number(settings.maxConcurrentBookings) || 1;

  const save = async () => {
    if (!f.bride_name.trim()) return toast('اسم العروسة مطلوب', 'error');
    if (!f.phone.trim()) return toast('رقم التليفون مطلوب', 'error');
    if (!pkg) return toast('اختر الباكدج', 'error');
    const doc = {
      ...f,
      bride_name: f.bride_name.trim(), groom_name: f.groom_name.trim(), phone: f.phone.trim(), phone2: f.phone2.trim(),
      package_name: pkg.name, pricing_type: pkg.pricing_type, package_price: Number(pkg.price) || 0,
      base_price: price.base, extras_total: price.extrasTotal, subtotal: price.subtotal,
      discount: canDiscount ? price.discount : 0, total: finalTotal,
      end_time: timeFromMinutes(minutesOf(f.start_time) + (Number(f.duration_minutes) || 60)),
    };
    delete doc.deposit; delete doc.deposit_method;
    let saved;
    try { saved = await act(async () => {
      const b = await api.put('bookings', doc);
      if (isNew && Number(f.deposit) > 0) {
        await api.put('payments', { booking_id: b.id, amount: Number(f.deposit), method: f.deposit_method, date: today(), kind: 'deposit', note: '' });
      }
      return b;
    }, isNew ? 'تم تسجيل الحجز' : 'تم حفظ التعديلات'); } catch { return; }
    onSaved(saved);
  };

  return (
    <Modal wide title={isNew ? 'حجز جديد' : `تعديل حجز ${bookingCode(initial)}`} onClose={onClose} footer={(
      <>
        <div className="foot-total">الإجمالي: <strong>{money(finalTotal, currency)}</strong></div>
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={save}>حفظ الحجز</button>
      </>
    )}>
      <div className="grid grid-3">
        <Field label="اسم العروسة *"><input autoFocus value={f.bride_name} onChange={(e) => set('bride_name', e.target.value)} /></Field>
        <Field label="اسم العريس"><input value={f.groom_name} onChange={(e) => set('groom_name', e.target.value)} /></Field>
        <Field label="الحالة">
          <select value={f.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="تليفون *"><input dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="تليفون آخر"><input dir="ltr" value={f.phone2} onChange={(e) => set('phone2', e.target.value)} /></Field>
        <Field label="المصور / الاستوديو"><input value={f.photographer} onChange={(e) => set('photographer', e.target.value)} /></Field>
        <Field label="التاريخ"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="وقت البداية"><input type="time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
        <Field label="المدة (بالدقائق)" hint={durationLabel(f.duration_minutes)}>
          <input type="number" min="15" step="15" value={f.duration_minutes} onChange={(e) => set('duration_minutes', Number(e.target.value))} />
        </Field>
      </div>

      {conflicts.length >= maxConcurrent && (
        <div className="alert alert-warn">
          تنبيه: يوجد {conflicts.length} حجز في نفس الوقت ({conflicts.map((c) => `${c.bride_name} ${time12(c.start_time)}`).join('، ')}) — الحد المسموح {maxConcurrent}.
        </div>
      )}

      <h4 className="section-title">الباكدج والسعر</h4>
      <div className="pkg-grid">
        {activePackages.map((p) => (
          <button key={p.id} type="button" className={`pkg ${f.package_id === p.id ? 'selected' : ''}`} onClick={() => choosePackage(p.id)}>
            <strong>{p.name}</strong>
            <span>{p.pricing_type === 'custom' ? 'سعر يدوي' : `${money(p.price, currency)}${p.pricing_type === 'hourly' ? ' / ساعة' : ''}`}</span>
            {p.pricing_type === 'fixed' && <small>{durationLabel(p.duration_minutes)}</small>}
          </button>
        ))}
      </div>

      <div className="grid grid-3">
        {pkg?.pricing_type === 'hourly' && (
          <Field label="عدد الساعات">
            <input type="number" min="0.5" step="0.5" value={f.hours} onChange={(e) => { const h = Number(e.target.value); setF((x) => ({ ...x, hours: h, duration_minutes: Math.round(h * 60) })); }} />
          </Field>
        )}
        {pkg?.pricing_type === 'custom' && (
          <Field label="السعر المتفق عليه"><MoneyInput value={f.custom_price} onChange={(v) => set('custom_price', v)} /></Field>
        )}
        {canDiscount && <Field label="خصم"><MoneyInput value={f.discount} onChange={(v) => set('discount', v)} /></Field>}
        {canEditPrice && pkg?.pricing_type !== 'custom' && (
          <Field label="تعديل السعر النهائي (اختياري)" hint={`المحسوب: ${money(price.total, currency)}`}>
            <MoneyInput value={f.price_override} onChange={(v) => set('price_override', v)} placeholder="اتركه فارغاً للسعر المحسوب" />
          </Field>
        )}
      </div>

      {extrasList.filter((e) => e.active).length > 0 && (
        <>
          <h4 className="section-title">إضافات</h4>
          <div className="chips">
            {extrasList.filter((e) => e.active || f.extras.some((x) => x.id === e.id)).map((e) => (
              <button key={e.id} type="button" className={`chip ${f.extras.some((x) => x.id === e.id) ? 'selected' : ''}`} onClick={() => toggleExtra(e)}>
                {e.name} (+{money(e.price, currency)})
              </button>
            ))}
          </div>
        </>
      )}

      <div className="grid grid-3">
        {isNew && (
          <>
            <Field label="عربون مدفوع الآن"><MoneyInput value={f.deposit} onChange={(v) => set('deposit', v)} /></Field>
            <Field label="طريقة دفع العربون"><MethodSelect value={f.deposit_method} onChange={(v) => set('deposit_method', v)} methods={settings.paymentMethods} /></Field>
          </>
        )}
        <Field label="عدد المرافقين"><input type="number" min="0" value={f.guests} onChange={(e) => set('guests', e.target.value)} /></Field>
        <Field label="ملاحظات" span={3}><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function BookingDetail({ booking: b, payments, onClose, onEdit }) {
  const { settings, isAdmin, currency } = useApp();
  const act = useAction();
  const [pay, setPay] = useState({ amount: '', method: (settings.paymentMethods || ['كاش'])[0], note: '', refund: false });
  const [confirm, setConfirm] = useState(null);
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = (Number(b.total) || 0) - paid;
  const [users] = useData('users');
  const userName = (id) => users.find((u) => u.id === id)?.name || '';

  const addPayment = async () => {
    const amount = Number(pay.amount);
    if (!(amount > 0)) return;
    await act(() => api.put('payments', {
      booking_id: b.id, amount: pay.refund ? -amount : amount, method: pay.method, date: today(),
      kind: pay.refund ? 'refund' : (paid <= 0 ? 'deposit' : 'payment'), note: pay.note,
    }), pay.refund ? 'تم تسجيل الاسترداد' : 'تم تسجيل الدفعة');
    setPay({ ...pay, amount: '', note: '', refund: false });
  };

  const setStatus = (status) => act(() => api.put('bookings', { ...b, status }), 'تم تحديث الحالة');

  const print = () => printReceipt({
    venueName: settings.venueName,
    title: `إيصال حجز ${bookingCode(b)}`,
    lines: [
      ['العروسة', b.bride_name], ['العريس', b.groom_name || '-'], ['التليفون', b.phone],
      ['الموعد', `${b.date} ${time12(b.start_time)}`], ['المدة', durationLabel(b.duration_minutes)], ['الباكدج', b.package_name],
    ],
    items: (b.extras || []).map((e) => ({ name: e.name, qty: e.qty || 1, total: money(e.price, currency) })),
    totals: [
      ['الإجمالي', money(b.total, currency), true], ['المدفوع', money(paid, currency)], ['المتبقي', money(remaining, currency), true],
    ],
    footer: settings.receiptFooter,
  });

  return (
    <Modal wide title={`حجز ${bookingCode(b)} — ${b.bride_name}`} onClose={onClose} footer={(
      <>
        {isAdmin && <button className="btn btn-danger-ghost" onClick={() => setConfirm('delete')}>حذف الحجز</button>}
        <span className="spacer" />
        <button className="btn" onClick={print}>طباعة إيصال</button>
        <button className="btn btn-primary" onClick={onEdit}>تعديل</button>
      </>
    )}>
      <div className="detail-grid">
        <div>
          <dl className="dl">
            <dt>العروسة</dt><dd>{b.bride_name}</dd>
            <dt>العريس</dt><dd>{b.groom_name || '-'}</dd>
            <dt>التليفون</dt><dd className="mono">{b.phone}{b.phone2 ? ` / ${b.phone2}` : ''}</dd>
            <dt>الموعد</dt><dd>{prettyDate(b.date)} — {time12(b.start_time)} إلى {time12(b.end_time)}</dd>
            <dt>الباكدج</dt><dd>{b.package_name}{b.pricing_type === 'hourly' ? ` (${b.hours} ساعة)` : ''}</dd>
            {(b.extras || []).length > 0 && (<><dt>الإضافات</dt><dd>{b.extras.map((e) => e.name).join('، ')}</dd></>)}
            {b.photographer && (<><dt>المصور</dt><dd>{b.photographer}</dd></>)}
            {b.guests && (<><dt>المرافقين</dt><dd>{b.guests}</dd></>)}
            {b.notes && (<><dt>ملاحظات</dt><dd>{b.notes}</dd></>)}
            <dt>سجّله</dt><dd>{userName(b.created_by)}</dd>
          </dl>
          <div className="status-actions">
            <span className="muted">الحالة:</span>
            {Object.entries(BOOKING_STATUS).map(([k, v]) => (
              <button key={k} className={`chip ${b.status === k ? 'selected' : ''}`} onClick={() => b.status !== k && setStatus(k)}>{v.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="money-box">
            <div><span>الإجمالي</span><strong>{money(b.total, currency)}</strong></div>
            {Number(b.discount) > 0 && <div><span>خصم</span><strong>{money(b.discount, currency)}</strong></div>}
            <div><span>المدفوع</span><strong className="text-ok">{money(paid, currency)}</strong></div>
            <div><span>المتبقي</span><strong className={remaining > 0 ? 'text-danger' : 'text-ok'}>{money(remaining, currency)}</strong></div>
          </div>
          <h4 className="section-title">الدفعات</h4>
          {payments.length === 0 ? <Empty>لا توجد دفعات</Empty> : (
            <table className="table compact">
              <tbody>
                {[...payments].sort((a, c) => (a.created_at || 0) - (c.created_at || 0)).map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td className={p.amount < 0 ? 'text-danger' : ''}>{money(p.amount, currency)}</td>
                    <td>{p.method}</td>
                    <td className="muted small">{p.kind === 'deposit' ? 'عربون' : p.kind === 'refund' ? 'استرداد' : 'دفعة'} {p.note ? `- ${p.note}` : ''}</td>
                    <td className="muted small">{userName(p.created_by)}</td>
                    {isAdmin && <td><button className="icon-btn" title="حذف" onClick={() => setConfirm({ payment: p })}>🗑</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="pay-form">
            <MoneyInput value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} placeholder={remaining > 0 ? `المتبقي ${remaining}` : 'المبلغ'} />
            <MethodSelect value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} methods={settings.paymentMethods} />
            <input placeholder="ملاحظة" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
            <label className="check"><input type="checkbox" checked={pay.refund} onChange={(e) => setPay({ ...pay, refund: e.target.checked })} /> استرداد</label>
            <button className="btn btn-primary" onClick={addPayment} disabled={!(Number(pay.amount) > 0)}>تسجيل</button>
            {remaining > 0 && <button className="btn btn-sm" onClick={() => setPay({ ...pay, amount: remaining, refund: false })}>دفع المتبقي</button>}
          </div>
        </div>
      </div>
      {confirm === 'delete' && (
        <Confirm message={`حذف حجز ${b.bride_name} نهائياً؟ الدفعات المسجلة ستظل في الحسابات.`} onClose={() => setConfirm(null)}
          onConfirm={async () => { await act(() => api.remove('bookings', b.id), 'تم حذف الحجز'); onClose(); }} />
      )}
      {confirm?.payment && (
        <Confirm message={`حذف دفعة ${money(confirm.payment.amount, currency)}؟`} onClose={() => setConfirm(null)}
          onConfirm={() => act(() => api.remove('payments', confirm.payment.id), 'تم حذف الدفعة')} />
      )}
    </Modal>
  );
}
