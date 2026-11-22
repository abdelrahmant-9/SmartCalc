import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { addDays, endOfMonth, money, startOfMonth, startOfWeek, today, toCSV } from '../lib/format.js';
import { movements, SECTION_LABELS, summarize } from '../lib/finance.js';
import { Confirm, Empty, Field, MethodSelect, Modal, MoneyInput, PageHead, Stat } from '../components/ui.jsx';

export function RangePicker({ value, onChange }) {
  const t = today();
  const presets = [
    ['اليوم', t, t],
    ['أمس', addDays(t, -1), addDays(t, -1)],
    ['الأسبوع', startOfWeek(t), t],
    ['الشهر', startOfMonth(t), endOfMonth(t)],
    ['الشهر الماضي', startOfMonth(addDays(startOfMonth(t), -1)), addDays(startOfMonth(t), -1)],
  ];
  return (
    <div className="range">
      {presets.map(([label, from, to]) => (
        <button key={label} className={`chip ${value.from === from && value.to === to ? 'selected' : ''}`} onClick={() => onChange({ from, to })}>{label}</button>
      ))}
      <input type="date" value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
      <span className="muted">إلى</span>
      <input type="date" value={value.to} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
    </div>
  );
}

export function TransactionForm({ initial, onClose, lockSection }) {
  const { settings, isAdmin } = useApp();
  const act = useAction();
  const cats = initial.type === 'in' ? settings.incomeCategories || [] : settings.expenseCategories || [];
  const [f, setF] = useState({
    date: today(), section: 'general', category: cats[0] || '', amount: '', method: (settings.paymentMethods || ['كاش'])[0], note: '', ...initial,
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    if (!(Number(f.amount) > 0)) return;
    try {
      await act(() => api.put('transactions', { ...f, amount: Number(f.amount) }), f.type === 'in' ? 'تم تسجيل الإيراد' : 'تم تسجيل المصروف');
      onClose();
    } catch { /* toast shown */ }
  };
  return (
    <Modal title={f.type === 'in' ? 'تسجيل إيراد' : 'تسجيل مصروف'} onClose={onClose} footer={(
      <>
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={save} disabled={!(Number(f.amount) > 0)}>حفظ</button>
      </>
    )}>
      <div className="grid">
        <Field label="المبلغ"><MoneyInput autoFocus value={f.amount} onChange={set('amount')} /></Field>
        <Field label="التاريخ"><input type="date" value={f.date} onChange={set('date')} disabled={!isAdmin} /></Field>
        <Field label="القسم">
          <select value={f.section} onChange={set('section')} disabled={lockSection}>
            {Object.entries(SECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="البند">
          <input list="tx-cats" value={f.category} onChange={set('category')} />
          <datalist id="tx-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="طريقة الدفع"><MethodSelect value={f.method} onChange={set('method')} methods={settings.paymentMethods} /></Field>
        <Field label="تفاصيل"><input value={f.note} onChange={set('note')} /></Field>
      </div>
    </Modal>
  );
}

export default function Finance() {
  const { isAdmin } = useApp();
  return isAdmin ? <AdminFinance /> : <EmployeeFinance />;
}

function useMovements(range) {
  const opts = { field: 'date', from: range.from, to: range.to };
  const deps = [range.from, range.to];
  const [payments] = useData('payments', opts, deps);
  const [ticketSales] = useData('ticket_sales', opts, deps);
  const [cafeOrders] = useData('cafe_orders', opts, deps);
  const [transactions] = useData('transactions', opts, deps);
  const [bookings] = useData('bookings');
  const [users] = useData('users');
  const list = useMemo(() => movements({ payments, ticketSales, cafeOrders, transactions, bookings }), [payments, ticketSales, cafeOrders, transactions, bookings]);
  return { list, users, transactions };
}

function AdminFinance() {
  const { currency } = useApp();
  const act = useAction();
  const [range, setRange] = useState({ from: startOfMonth(), to: today() });
  const [section, setSection] = useState('all');
  const [type, setType] = useState('all');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const { list, users, transactions } = useMovements(range);
  const [allPayments] = useData('payments');
  const [bookings] = useData('bookings');

  const s = summarize(list);
  const filtered = list.filter((m) => (section === 'all' || m.section === section) && (type === 'all' || m.type === type));
  const userName = (id) => users.find((u) => u.id === id)?.name || '-';

  // Money still owed on upcoming, non-cancelled bookings.
  const receivable = useMemo(() => {
    const paid = {};
    for (const p of allPayments) paid[p.booking_id] = (paid[p.booking_id] || 0) + (Number(p.amount) || 0);
    return bookings
      .filter((b) => !['cancelled', 'no_show'].includes(b.status))
      .reduce((sum, b) => sum + Math.max(0, (Number(b.total) || 0) - (paid[b.id] || 0)), 0);
  }, [allPayments, bookings]);

  const exportCSV = async () => {
    const csv = toCSV(
      ['التاريخ', 'القسم', 'النوع', 'البيان', 'البند', 'المبلغ', 'طريقة الدفع', 'الموظف'],
      filtered.map((m) => [m.date, SECTION_LABELS[m.section] || m.section, m.type === 'in' ? 'إيراد' : 'مصروف', m.label, m.category, m.amount, m.method, userName(m.user)]),
    );
    try {
      const p = await api.saveFile({ defaultPath: `heaven-accounts-${range.from}_${range.to}.csv`, content: csv, filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (p) act(async () => p, 'تم حفظ الملف');
    } catch { /* ignore */ }
  };

  return (
    <>
      <PageHead title="الحسابات" sub="كل الفلوس الداخلة والطالعة">
        <button className="btn" onClick={exportCSV}>تصدير Excel</button>
        <button className="btn" onClick={() => setForm({ type: 'in' })}>+ إيراد</button>
        <button className="btn btn-primary" onClick={() => setForm({ type: 'out' })}>+ مصروف</button>
      </PageHead>
      <div className="toolbar"><RangePicker value={range} onChange={setRange} /></div>

      <div className="stats">
        <Stat label="إجمالي الداخل" value={money(s.in, currency)} tone="ok" />
        <Stat label="إجمالي الخارج" value={money(s.out, currency)} tone="danger" />
        <Stat label="الصافي" value={money(s.net, currency)} tone={s.net >= 0 ? 'ok' : 'danger'} />
        <Stat label="متبقي على العرائس" value={money(receivable, currency)} sub="مستحقات لم تُحصّل" tone="warn" />
      </div>

      <div className="three-col">
        <div className="card">
          <h3>حسب القسم</h3>
          <table className="table compact">
            <thead><tr><th>القسم</th><th>داخل</th><th>خارج</th><th>صافي</th></tr></thead>
            <tbody>
              {Object.keys(SECTION_LABELS).map((k) => {
                const v = s.bySection[k] || { in: 0, out: 0 };
                return <tr key={k}><td>{SECTION_LABELS[k]}</td><td>{money(v.in, currency)}</td><td>{money(v.out, currency)}</td><td className={v.in - v.out >= 0 ? 'text-ok' : 'text-danger'}>{money(v.in - v.out, currency)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>حسب طريقة الدفع (صافي)</h3>
          {Object.keys(s.byMethod).length === 0 ? <Empty /> : (
            <table className="table compact">
              <tbody>{Object.entries(s.byMethod).map(([k, v]) => <tr key={k}><td>{k}</td><td>{money(v, currency)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>حسب الموظف</h3>
          {Object.keys(s.byUser).length === 0 ? <Empty /> : (
            <table className="table compact">
              <thead><tr><th>الموظف</th><th>حصّل</th><th>صرف</th></tr></thead>
              <tbody>{Object.entries(s.byUser).map(([k, v]) => <tr key={k}><td>{userName(k)}</td><td>{money(v.in, currency)}</td><td>{money(v.out, currency)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row-between">
          <h3>كل الحركات ({filtered.length})</h3>
          <div className="row">
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="all">كل الأقسام</option>
              {Object.entries(SECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">داخل وخارج</option>
              <option value="in">داخل فقط</option>
              <option value="out">خارج فقط</option>
            </select>
          </div>
        </div>
        {filtered.length === 0 ? <Empty>لا توجد حركات في هذه الفترة</Empty> : (
          <MovementTable rows={filtered} userName={userName} currency={currency}
            onDelete={(m) => {
              const tx = m.key.startsWith('x-') && transactions.find((t) => `x-${t.id}` === m.key);
              if (tx) setConfirm(tx);
            }} />
        )}
      </div>
      {form && <TransactionForm initial={form} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`حذف "${confirm.category || ''}" بقيمة ${money(confirm.amount, currency)}؟`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('transactions', confirm.id), 'تم الحذف')} />}
    </>
  );
}

function MovementTable({ rows, userName, currency, onDelete }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>التاريخ</th><th>القسم</th><th>البيان</th><th>البند</th><th>المبلغ</th><th>الدفع</th><th>الموظف</th>{onDelete && <th />}</tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.key}>
              <td>{m.date}</td>
              <td>{SECTION_LABELS[m.section] || m.section}</td>
              <td>{m.label}</td>
              <td className="muted">{m.category}</td>
              <td className={m.type === 'in' ? 'text-ok' : 'text-danger'}>{m.type === 'in' ? '+' : '−'} {money(m.amount, currency)}</td>
              <td>{m.method}</td>
              <td>{userName(m.user)}</td>
              {onDelete && <td>{m.key.startsWith('x-') && <button className="icon-btn" title="حذف" onClick={() => onDelete(m)}>🗑</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeFinance() {
  const { currency, user, settings } = useApp();
  const [form, setForm] = useState(null);
  const range = useMemo(() => ({ from: today(), to: today() }), []);
  const { list, users } = useMovements(range);
  const mine = list.filter((m) => m.user === user.id);
  const s = summarize(mine);
  const userName = (id) => users.find((u) => u.id === id)?.name || '-';

  return (
    <>
      <PageHead title="حسابات اليوم" sub="العمليات اللي سجلتها النهارده — للتقفيل مع المدير">
        {settings.allowEmployeeExpenses && <button className="btn btn-primary" onClick={() => setForm({ type: 'out' })}>+ تسجيل مصروف</button>}
      </PageHead>
      <div className="stats">
        <Stat label="اللي حصّلته" value={money(s.in, currency)} tone="ok" />
        <Stat label="اللي صرفته" value={money(s.out, currency)} tone="danger" />
        <Stat label="المفروض يكون معاك" value={money(s.net, currency)} />
      </div>
      <div className="card">
        <h3>حسب طريقة الدفع</h3>
        {Object.keys(s.byMethod).length === 0 ? <Empty /> : (
          <div className="stats stats-inline">
            {Object.entries(s.byMethod).map(([k, v]) => <Stat key={k} label={k} value={money(v, currency)} />)}
          </div>
        )}
      </div>
      <div className="card">
        <h3>عملياتي اليوم ({mine.length})</h3>
        {mine.length === 0 ? <Empty>لم تسجل أي عمليات اليوم</Empty> : <MovementTable rows={mine} userName={userName} currency={currency} />}
      </div>
      {form && <TransactionForm initial={form} onClose={() => setForm(null)} />}
    </>
  );
}
