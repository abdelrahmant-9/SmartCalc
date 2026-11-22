import { useMemo, useState } from 'react';
import {
  CalendarDays, CalendarHeart, Check, ChevronLeft, ChevronRight, List, Pencil, Plus, Printer, Search, Trash2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import {
  addDays, durationLabel, endOfMonth, minutesOf, money, MONTHS, num, prettyDate, startOfMonth, time12,
  timeFromMinutes, today, toISODate, WEEK_DAYS_FROM_SAT,
} from '../lib/format.js';
import { BOOKING_STATUS, computeBookingPrice, overlaps, paidFor } from '../lib/finance.js';
import { printReceipt } from '../lib/print.js';
import {
  Confirm, Empty, Field, MethodSelect, Modal, MoneyInput, Notice, Page, Panel, Segmented, StatusBadge,
} from '../components/ui.jsx';

export const bookingCode = (b) => (b?.id || '').replace(/^seed-/, '').slice(0, 6).toUpperCase();
const couple = (b) => `${b.bride_name}${b.groom_name ? ` و${b.groom_name}` : ''}`;

export default function Bookings() {
  const { currency } = useApp();
  const [view, setView] = useState('calendar');
  const [month, setMonth] = useState(startOfMonth());
  const [selectedDay, setSelectedDay] = useState(today());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);

  const [bookings] = useData('bookings');
  const [payments] = useData('payments');

  const visible = useMemo(() => bookings.filter((b) => {
    if (status === 'active' && ['cancelled', 'no_show'].includes(b.status)) return false;
    if (status !== 'active' && status !== 'all' && b.status !== status) return false;
    const q = search.trim();
    if (!q) return true;
    return [b.bride_name, b.groom_name, b.phone, b.phone2, bookingCode(b)].some((v) => String(v || '').toUpperCase().includes(q.toUpperCase()));
  }), [bookings, search, status]);

  const byDay = useMemo(() => {
    const m = {};
    for (const b of visible) (m[b.date] ||= []).push(b);
    Object.values(m).forEach((l) => l.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));
    return m;
  }, [visible]);

  const openBooking = bookings.find((b) => b.id === openId);
  const dayList = byDay[selectedDay] || [];

  return (
    <Page
      title="الحجوزات"
      actions={(
        <>
          <div className="search">
            <Search size={16} />
            <input placeholder="اسم، تليفون، أو كود الحجز" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">الحجوزات القائمة</option>
            <option value="all">كل الحالات</option>
            {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Segmented value={view} onChange={setView} options={[{ id: 'calendar', label: 'تقويم', icon: CalendarDays }, { id: 'list', label: 'قائمة', icon: List }]} />
          <button className="btn btn-primary" onClick={() => setEditing({ date: selectedDay })}><Plus />حجز جديد</button>
        </>
      )}
    >
      {view === 'calendar' ? (
        <div className="cal-layout">
          <MonthCalendar month={month} setMonth={setMonth} byDay={byDay} selected={selectedDay} onSelect={setSelectedDay} />
          <Panel
            className="day-panel" body={false}
            title={prettyDate(selectedDay)} meta={dayList.length ? `${dayList.length} حجز` : null}
            actions={<button className="btn btn-sm" onClick={() => setEditing({ date: selectedDay })}><Plus />إضافة</button>}
          >
            {dayList.length === 0 ? <Empty icon={CalendarHeart}>لا توجد حجوزات في هذا اليوم</Empty> : (
              <div className="agenda">
                {dayList.map((b) => (
                  <AgendaItem key={b.id} b={b} paid={paidFor(b.id, payments)} currency={currency} onClick={() => setOpenId(b.id)} />
                ))}
              </div>
            )}
          </Panel>
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
    </Page>
  );
}

function AgendaItem({ b, paid, currency, onClick }) {
  const remaining = (Number(b.total) || 0) - paid;
  return (
    <button className="agenda-item" onClick={onClick}>
      <div className="agenda-time">{time12(b.start_time)}<small>{durationLabel(b.duration_minutes)}</small></div>
      <div>
        <div className="agenda-name">{couple(b)}</div>
        <div className="agenda-meta">{b.package_name} · <span className="mono">{b.phone}</span></div>
      </div>
      <div className="agenda-side">
        <StatusBadge status={b.status} />
        <span className={remaining > 0 ? 'text-danger' : 'muted'}>{remaining > 0 ? `متبقي ${money(remaining, currency)}` : 'مدفوع'}</span>
      </div>
    </button>
  );
}

function MonthCalendar({ month, setMonth, byDay, selected, onSelect }) {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 1) % 7; // Saturday-first grid
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(y, m - 1, d)));
  while (cells.length % 7) cells.push(null);
  const t = today();
  const monthCount = Object.entries(byDay).filter(([d]) => d.startsWith(month.slice(0, 7))).reduce((s, [, l]) => s + l.length, 0);

  return (
    <Panel
      body={false}
      title={(
        <span className="cal-toolbar">
          <button className="icon-btn" title="الشهر السابق" onClick={() => setMonth(startOfMonth(addDays(month, -1)))}><ChevronRight /></button>
          <button className="icon-btn" title="الشهر التالي" onClick={() => setMonth(startOfMonth(addDays(endOfMonth(month), 1)))}><ChevronLeft /></button>
          <span className="cal-title">{MONTHS[m - 1]} {y}</span>
        </span>
      )}
      meta={`${monthCount} حجز`}
      actions={<button className="btn btn-sm" onClick={() => { setMonth(startOfMonth()); onSelect(today()); }}>اليوم</button>}
    >
      <div className="cal-grid">
        {WEEK_DAYS_FROM_SAT.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`x${i}`} className="cal-cell out" />;
          const list = byDay[iso] || [];
          return (
            <button key={iso} className={`cal-cell ${iso === selected ? 'selected' : ''} ${iso === t ? 'today' : ''}`} onClick={() => onSelect(iso)}>
              <span className="cal-num">{Number(iso.slice(8))}</span>
              {list.slice(0, 3).map((b) => (
                <span key={b.id} className={`cal-event ev-${b.status}`}><b>{time12(b.start_time).replace(/ .+$/, '')}</b> {b.bride_name}</span>
              ))}
              {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function BookingTable({ bookings, payments, currency, onOpen }) {
  const rows = [...bookings].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.start_time || '').localeCompare(b.start_time || ''));
  return (
    <Panel body={false} title="كل الحجوزات" meta={rows.length}>
      {!rows.length ? <Empty icon={CalendarHeart}>لا توجد حجوزات مطابقة</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>الموعد</th><th>العروسة والعريس</th><th>الباكدج</th><th>الحالة</th><th className="end">الإجمالي</th><th className="end">المدفوع</th><th className="end">المتبقي</th><th>الكود</th></tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const paid = paidFor(b.id, payments);
                const rem = (Number(b.total) || 0) - paid;
                return (
                  <tr key={b.id} className="clickable" onClick={() => onOpen(b.id)}>
                    <td><div className="cell-title num">{b.date}</div><div className="cell-sub">{time12(b.start_time)}</div></td>
                    <td><div className="cell-title">{couple(b)}</div><div className="cell-sub mono">{b.phone}</div></td>
                    <td>{b.package_name}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="end num">{num(b.total)}</td>
                    <td className="end num">{num(paid)}</td>
                    <td className={`end num ${rem > 0 ? 'text-danger' : 'muted'}`}>{num(rem)}</td>
                    <td className="mono muted small">{bookingCode(b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
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
  const visibleExtras = extrasList.filter((e) => e.active || f.extras.some((x) => x.id === e.id));

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
    try {
      saved = await act(async () => {
        const b = await api.put('bookings', doc);
        if (isNew && Number(f.deposit) > 0) {
          await api.put('payments', { booking_id: b.id, amount: Number(f.deposit), method: f.deposit_method, date: today(), kind: 'deposit', note: '' });
        }
        return b;
      }, isNew ? 'تم تسجيل الحجز' : 'تم حفظ التعديلات');
    } catch { return; }
    onSaved(saved);
  };

  return (
    <Modal wide title={isNew ? 'حجز جديد' : 'تعديل الحجز'} sub={isNew ? null : `${couple(initial)} · ${bookingCode(initial)}`} onClose={onClose} footer={(
      <>
        <div className="foot-total">الإجمالي<strong>{money(finalTotal, currency)}</strong></div>
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={save}><Check />حفظ</button>
      </>
    )}>
      <div className="form-section">
        <div className="form-section-title">العميل</div>
        <div className="form-grid three">
          <Field label="اسم العروسة"><input autoFocus value={f.bride_name} onChange={(e) => set('bride_name', e.target.value)} /></Field>
          <Field label="اسم العريس"><input value={f.groom_name} onChange={(e) => set('groom_name', e.target.value)} /></Field>
          <Field label="المصور / الاستوديو"><input value={f.photographer} onChange={(e) => set('photographer', e.target.value)} /></Field>
          <Field label="رقم التليفون"><input dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="01xxxxxxxxx" /></Field>
          <Field label="رقم آخر"><input dir="ltr" value={f.phone2} onChange={(e) => set('phone2', e.target.value)} /></Field>
          <Field label="عدد المرافقين"><input type="number" min="0" value={f.guests} onChange={(e) => set('guests', e.target.value)} /></Field>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">الموعد</div>
        <div className="form-grid three">
          <Field label="التاريخ"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="من الساعة"><input type="time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
          <Field label="المدة بالدقائق" hint={durationLabel(f.duration_minutes)}>
            <input type="number" min="15" step="15" value={f.duration_minutes} onChange={(e) => set('duration_minutes', Number(e.target.value))} />
          </Field>
          <Field label="الحالة">
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        {conflicts.length >= maxConcurrent && (
          <div style={{ marginTop: 12 }}>
            <Notice tone="warn">
              يوجد {conflicts.length} حجز في نفس التوقيت ({conflicts.map((c) => `${c.bride_name} ${time12(c.start_time)}`).join('، ')}). الحد المسموح {maxConcurrent}.
            </Notice>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="form-section-title">الباكدج والسعر</div>
        <div className="pkg-grid">
          {activePackages.map((p) => (
            <button key={p.id} type="button" className={`pkg ${f.package_id === p.id ? 'selected' : ''}`} onClick={() => choosePackage(p.id)}>
              {f.package_id === p.id && <Check size={15} className="tick" />}
              <strong>{p.name}</strong>
              <span className="price">{p.pricing_type === 'custom' ? 'سعر يحدد يدوياً' : `${money(p.price, currency)}${p.pricing_type === 'hourly' ? ' / ساعة' : ''}`}</span>
              <small>{p.pricing_type === 'fixed' ? durationLabel(p.duration_minutes) : p.pricing_type === 'hourly' ? 'حسب عدد الساعات' : ' '}</small>
            </button>
          ))}
        </div>
        {visibleExtras.length > 0 && (
          <div className="chips" style={{ marginTop: 12 }}>
            {visibleExtras.map((e) => {
              const on = f.extras.some((x) => x.id === e.id);
              return <button key={e.id} type="button" className={`chip ${on ? 'selected' : ''}`} onClick={() => toggleExtra(e)}>{on ? '✓ ' : '+ '}{e.name} · {num(e.price)}</button>;
            })}
          </div>
        )}
        <div className="form-grid three" style={{ marginTop: 14 }}>
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
            <Field label="سعر نهائي مختلف" hint={`المحسوب ${money(price.total, currency)}`}>
              <MoneyInput value={f.price_override} onChange={(v) => set('price_override', v)} placeholder="اختياري" />
            </Field>
          )}
        </div>
      </div>

      <div className="form-section">
        <div className="form-grid three">
          {isNew && (
            <>
              <Field label="عربون مدفوع"><MoneyInput value={f.deposit} onChange={(v) => set('deposit', v)} placeholder="0" /></Field>
              <Field label="طريقة الدفع"><MethodSelect value={f.deposit_method} onChange={(v) => set('deposit_method', v)} methods={settings.paymentMethods} /></Field>
            </>
          )}
          <Field label="ملاحظات" span={isNew ? undefined : true}><input value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
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
    try {
      await act(() => api.put('payments', {
        booking_id: b.id, amount: pay.refund ? -amount : amount, method: pay.method, date: today(),
        kind: pay.refund ? 'refund' : (paid <= 0 ? 'deposit' : 'payment'), note: pay.note,
      }), pay.refund ? 'تم تسجيل الاسترداد' : 'تم تسجيل الدفعة');
      setPay({ ...pay, amount: '', note: '', refund: false });
    } catch { /* toast shown */ }
  };

  const setStatus = (status) => act(() => api.put('bookings', { ...b, status }), 'تم تحديث الحالة').catch(() => {});

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

  const kindLabel = (p) => (p.kind === 'deposit' ? 'عربون' : p.kind === 'refund' ? 'استرداد' : 'دفعة');

  return (
    <Modal wide title={couple(b)} sub={`${prettyDate(b.date)} · ${time12(b.start_time)} · ${bookingCode(b)}`} onClose={onClose} footer={(
      <>
        {isAdmin && <button className="btn btn-danger-quiet" onClick={() => setConfirm('delete')}><Trash2 />حذف</button>}
        <span className="spacer" />
        <button className="btn" onClick={print}><Printer />إيصال</button>
        <button className="btn btn-primary" onClick={onEdit}><Pencil />تعديل</button>
      </>
    )}>
      <div className="detail">
        <div>
          <dl className="facts">
            <dt>التليفون</dt><dd className="mono">{b.phone}{b.phone2 ? ` · ${b.phone2}` : ''}</dd>
            <dt>الموعد</dt><dd>{time12(b.start_time)} – {time12(b.end_time)} <span className="muted">({durationLabel(b.duration_minutes)})</span></dd>
            <dt>الباكدج</dt><dd>{b.package_name}{b.pricing_type === 'hourly' ? ` · ${b.hours} ساعة` : ''}</dd>
            {(b.extras || []).length > 0 && (<><dt>إضافات</dt><dd>{b.extras.map((e) => e.name).join('، ')}</dd></>)}
            {b.photographer && (<><dt>المصور</dt><dd>{b.photographer}</dd></>)}
            {b.guests && (<><dt>المرافقين</dt><dd>{b.guests}</dd></>)}
            {b.notes && (<><dt>ملاحظات</dt><dd>{b.notes}</dd></>)}
            <dt>سجّله</dt><dd>{userName(b.created_by) || '—'}</dd>
          </dl>
          <div className="status-row">
            {Object.entries(BOOKING_STATUS).map(([k, v]) => (
              <button key={k} className={`chip ${b.status === k ? 'selected' : ''}`} onClick={() => b.status !== k && setStatus(k)}>{v.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="balance">
            <div><span>الإجمالي</span><strong className="num">{num(b.total)}</strong></div>
            <div><span>المدفوع</span><strong className="num">{num(paid)}</strong></div>
            <div><span>المتبقي</span><strong className={`num ${remaining > 0 ? 'text-danger' : ''}`}>{num(remaining)}</strong></div>
          </div>
          <div className="subhead">الدفعات {Number(b.discount) > 0 && <span className="muted small">خصم {money(b.discount, currency)}</span>}</div>
          {payments.length === 0 ? <Empty>لم تُسجل دفعات</Empty> : (
            <table className="table compact plain">
              <tbody>
                {[...payments].sort((a, c) => (a.created_at || 0) - (c.created_at || 0)).map((p) => (
                  <tr key={p.id}>
                    <td className="num">{p.date}</td>
                    <td>{kindLabel(p)}{p.note ? <span className="muted"> · {p.note}</span> : ''}</td>
                    <td className="muted">{p.method}</td>
                    <td className="muted small">{userName(p.created_by)}</td>
                    <td className={`end num strong ${p.amount < 0 ? 'text-danger' : ''}`}>{num(p.amount)}</td>
                    {isAdmin && <td className="actions"><button className="icon-btn danger" title="حذف" onClick={() => setConfirm({ payment: p })}><Trash2 /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="pay-form">
            <MoneyInput value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} placeholder={remaining > 0 ? `المتبقي ${num(remaining)}` : 'المبلغ'} />
            <MethodSelect value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} methods={settings.paymentMethods} />
            <input placeholder="ملاحظة" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
            <label className="check"><input type="checkbox" checked={pay.refund} onChange={(e) => setPay({ ...pay, refund: e.target.checked })} />استرداد للعميل</label>
            {remaining > 0 && <button className="btn btn-quiet" onClick={() => setPay({ ...pay, amount: remaining, refund: false })}>المتبقي بالكامل</button>}
            <button className="btn btn-primary" onClick={addPayment} disabled={!(Number(pay.amount) > 0)}>تسجيل الدفعة</button>
          </div>
        </div>
      </div>
      {confirm === 'delete' && (
        <Confirm title="حذف الحجز" message={`سيتم حذف حجز ${couple(b)}. الدفعات المسجلة تظل في الحسابات.`} confirmText="حذف" onClose={() => setConfirm(null)}
          onConfirm={async () => { await act(() => api.remove('bookings', b.id), 'تم حذف الحجز'); onClose(); }} />
      )}
      {confirm?.payment && (
        <Confirm title="حذف دفعة" message={`حذف دفعة بقيمة ${money(confirm.payment.amount, currency)}؟`} confirmText="حذف" onClose={() => setConfirm(null)}
          onConfirm={() => act(() => api.remove('payments', confirm.payment.id), 'تم حذف الدفعة')} />
      )}
    </Modal>
  );
}
