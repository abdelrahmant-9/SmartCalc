import { useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Trash2, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { addDays, endOfMonth, money, num, prettyDate, startOfMonth, startOfWeek, today, toCSV } from '../lib/format.js';
import { movements, SECTION_LABELS, summarize } from '../lib/finance.js';
import { Confirm, Empty, Field, Metric, Metrics, MethodSelect, Modal, MoneyInput, Page, Panel, useShowMore } from '../components/ui.jsx';
import BarChart from '../components/BarChart.jsx';
import Combobox from '../components/Combobox.jsx';

export function RangePicker({ value, onChange }) {
  const t = today();
  const presets = [
    ['اليوم', t, t],
    ['أمس', addDays(t, -1), addDays(t, -1)],
    ['هذا الأسبوع', startOfWeek(t), t],
    ['هذا الشهر', startOfMonth(t), endOfMonth(t)],
    ['الشهر الماضي', startOfMonth(addDays(startOfMonth(t), -1)), addDays(startOfMonth(t), -1)],
  ];
  return (
    <div className="range">
      <div className="segmented">
        {presets.map(([label, from, to]) => (
          <button key={label} className={value.from === from && value.to === to ? 'active' : ''} onClick={() => onChange({ from, to })}>{label}</button>
        ))}
      </div>
      <input type="date" value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
      <span className="muted">—</span>
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
    <Modal title={f.type === 'in' ? 'إيراد جديد' : 'مصروف جديد'} sub={lockSection ? SECTION_LABELS[f.section] : null} onClose={onClose} footer={(
      <>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={save} disabled={!(Number(f.amount) > 0)}>حفظ</button>
      </>
    )}>
      <div className="form-grid">
        <Field label="المبلغ"><MoneyInput autoFocus value={f.amount} onChange={set('amount')} /></Field>
        <Field label="التاريخ"><input type="date" value={f.date} onChange={set('date')} disabled={!isAdmin} /></Field>
        {!lockSection && (
          <Field label="القسم">
            <select value={f.section} onChange={set('section')}>
              {Object.entries(SECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        )}
        <Field label="البند">
          <Combobox value={f.category} onChange={set('category')} options={cats} newLabel="بند جديد" />
        </Field>
        <Field label="طريقة الدفع"><MethodSelect value={f.method} onChange={set('method')} methods={settings.paymentMethods} /></Field>
        <Field label="التفاصيل" span={lockSection ? undefined : 2}><input value={f.note} onChange={set('note')} /></Field>
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

function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 120; d = addDays(d, 1)) out.push(d);
  return out;
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
  const userName = (id) => users.find((u) => u.id === id)?.name || '—';

  const receivable = useMemo(() => {
    const paid = {};
    for (const p of allPayments) paid[p.booking_id] = (paid[p.booking_id] || 0) + (Number(p.amount) || 0);
    return bookings
      .filter((b) => !['cancelled', 'no_show'].includes(b.status))
      .reduce((sum, b) => sum + Math.max(0, (Number(b.total) || 0) - (paid[b.id] || 0)), 0);
  }, [allPayments, bookings]);

  const days = daysBetween(range.from, range.to);
  const chartData = days.map((d) => ({ key: d, label: Number(d.slice(8)), title: prettyDate(d), value: s.byDay[d]?.in || 0 }));

  const exportCSV = async () => {
    const csv = toCSV(
      ['التاريخ', 'القسم', 'النوع', 'البيان', 'البند', 'المبلغ', 'طريقة الدفع', 'الموظف'],
      filtered.map((m) => [m.date, SECTION_LABELS[m.section] || m.section, m.type === 'in' ? 'إيراد' : 'مصروف', m.label, m.category, m.amount, m.method, userName(m.user)]),
    );
    try {
      const p = await api.saveFile({ defaultPath: `heaven-${range.from}_${range.to}.csv`, content: csv, filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (p) act(async () => p, 'تم حفظ الملف');
    } catch { /* ignore */ }
  };

  return (
    <Page
      title="الحسابات"
      actions={(
        <>
          <button className="btn" onClick={exportCSV}><FileSpreadsheet />تصدير Excel</button>
          <button className="btn" onClick={() => setForm({ type: 'in' })}><Plus />إيراد</button>
          <button className="btn btn-primary" onClick={() => setForm({ type: 'out' })}><Plus />مصروف</button>
        </>
      )}
    >
      <RangePicker value={range} onChange={setRange} />

      <Metrics>
        <Metric label="الداخل" amount={s.in} currency={currency} />
        <Metric label="الخارج" amount={s.out} currency={currency} />
        <Metric label="الصافي" amount={s.net} currency={currency} tone={s.net < 0 ? 'danger' : 'ok'} />
        <Metric label="مستحق على العرائس" amount={receivable} currency={currency} sub="كل الحجوزات القائمة" />
      </Metrics>

      {days.length > 1 && (
        <Panel title="الدخل اليومي" body={false}>
          <BarChart data={chartData} currency={currency} height={200} />
        </Panel>
      )}

      <div className="cols-3">
        <Panel title="حسب القسم" body={false}>
          <table className="table compact">
            <thead><tr><th>القسم</th><th className="end">داخل</th><th className="end">خارج</th><th className="end">صافي</th></tr></thead>
            <tbody>
              {Object.keys(SECTION_LABELS).map((k) => {
                const v = s.bySection[k] || { in: 0, out: 0 };
                return (
                  <tr key={k}>
                    <td>{SECTION_LABELS[k]}</td>
                    <td className="end num">{num(v.in)}</td>
                    <td className="end num">{num(v.out)}</td>
                    <td className={`end num strong ${v.in - v.out < 0 ? 'text-danger' : ''}`}>{num(v.in - v.out)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="حسب طريقة الدفع" meta="صافي" body={false}>
          {Object.keys(s.byMethod).length === 0 ? <Empty /> : (
            <table className="table compact">
              <tbody>{Object.entries(s.byMethod).map(([k, v]) => <tr key={k}><td>{k}</td><td className="end num strong">{num(v)}</td></tr>)}</tbody>
            </table>
          )}
        </Panel>
        <Panel title="حسب الموظف" body={false}>
          {Object.keys(s.byUser).length === 0 ? <Empty /> : (
            <table className="table compact">
              <thead><tr><th>الموظف</th><th className="end">حصّل</th><th className="end">صرف</th></tr></thead>
              <tbody>{Object.entries(s.byUser).map(([k, v]) => <tr key={k}><td>{userName(k)}</td><td className="end num">{num(v.in)}</td><td className="end num">{num(v.out)}</td></tr>)}</tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel
        body={false} title="الحركات" meta={filtered.length}
        actions={(
          <>
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="all">كل الأقسام</option>
              {Object.entries(SECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">داخل وخارج</option>
              <option value="in">داخل</option>
              <option value="out">خارج</option>
            </select>
          </>
        )}
      >
        {filtered.length === 0 ? <Empty icon={Wallet}>لا توجد حركات في هذه الفترة</Empty> : (
          <MovementTable rows={filtered} userName={userName}
            onDelete={(m) => {
              const tx = m.key.startsWith('x-') && transactions.find((t) => `x-${t.id}` === m.key);
              if (tx) setConfirm(tx);
            }} />
        )}
      </Panel>
      {form && <TransactionForm initial={form} onClose={() => setForm(null)} />}
      {confirm && <Confirm title="حذف حركة" confirmText="حذف" message={`حذف "${confirm.category || ''}" بقيمة ${money(confirm.amount, currency)}؟`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('transactions', confirm.id), 'تم الحذف')} />}
    </Page>
  );
}

function MovementTable({ rows, userName, onDelete }) {
  const [shown, more] = useShowMore(rows, 100, `${rows.length}-${rows[0]?.key || ''}`);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>التاريخ</th><th>البيان</th><th>القسم</th><th>الدفع</th><th>الموظف</th><th className="end">المبلغ</th>{onDelete && <th />}</tr></thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m.key}>
              <td className="num">{m.date}</td>
              <td><div className="cell-title">{m.label}</div>{m.category && m.category !== m.label && <div className="cell-sub">{m.category}</div>}</td>
              <td className="muted">{SECTION_LABELS[m.section] || m.section}</td>
              <td className="muted">{m.method}</td>
              <td className="muted">{userName(m.user)}</td>
              <td className={`end num strong ${m.type === 'in' ? 'text-ok' : ''}`}><span className="signed">{m.type === 'in' ? '+' : '−'}{num(m.amount)}</span></td>
              {onDelete && <td className="actions">{m.key.startsWith('x-') && <button className="icon-btn danger" title="حذف" onClick={() => onDelete(m)}><Trash2 /></button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {more}
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
  const userName = (id) => users.find((u) => u.id === id)?.name || '—';

  return (
    <Page
      title="حساب اليوم"
      sub="العمليات المسجلة باسمك اليوم — للتسليم آخر الوردية"
      actions={settings.allowEmployeeExpenses && <button className="btn btn-primary" onClick={() => setForm({ type: 'out' })}><Plus />مصروف</button>}
    >
      <Metrics>
        <Metric label="المحصّل" amount={s.in} currency={currency} />
        <Metric label="المصروف" amount={s.out} currency={currency} />
        <Metric label="المطلوب تسليمه" amount={s.net} currency={currency} tone="ok" />
      </Metrics>
      {Object.keys(s.byMethod).length > 0 && (
        <Metrics>
          {Object.entries(s.byMethod).map(([k, v]) => <Metric key={k} label={k} amount={v} currency={currency} />)}
        </Metrics>
      )}
      <Panel body={false} title="عملياتي" meta={mine.length || null}>
        {mine.length === 0 ? <Empty icon={Wallet}>لم تسجل أي عمليات اليوم</Empty> : <MovementTable rows={mine} userName={userName} />}
      </Panel>
      {form && <TransactionForm initial={form} onClose={() => setForm(null)} />}
    </Page>
  );
}
