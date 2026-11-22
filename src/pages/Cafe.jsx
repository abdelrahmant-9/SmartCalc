import { useMemo, useState } from 'react';
import { Coffee, Minus, Plus, Receipt, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { money, nowTime, num, startOfMonth, time12, today } from '../lib/format.js';
import { printReceipt } from '../lib/print.js';
import { Confirm, Empty, Metric, Metrics, MethodSelect, MoneyInput, Page, Panel, Tabs } from '../components/ui.jsx';
import { RangePicker, TransactionForm } from './Finance.jsx';

export default function Cafe() {
  const { can: canDo } = useApp();
  const tabs = [canDo('cafe.sell') && { id: 'pos', label: 'الكاشير' }, canDo('cafe.accounts') && { id: 'accounts', label: 'حسابات الكافيه' }].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.id || 'pos');
  const { can } = useApp();
  const [form, setForm] = useState(null);
  const canExpense = can('finance.expense');
  return (
    <Page
      title="الكافيه"
      tabs={tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      actions={tab === 'accounts' && (
        <>
          {can('finance.income') && <button className="btn" onClick={() => setForm({ type: 'in', section: 'cafe' })}><Plus />إيراد</button>}
          {canExpense && <button className="btn btn-primary" onClick={() => setForm({ type: 'out', section: 'cafe' })}><Plus />مصروف</button>}
        </>
      )}
    >
      {tab === 'pos' ? <Pos /> : <CafeAccounts />}
      {form && <TransactionForm initial={form} lockSection onClose={() => setForm(null)} />}
    </Page>
  );
}

function Pos() {
  const { settings, currency, can, user } = useApp();
  const act = useAction();
  const [items] = useData('cafe_items');
  const [orders] = useData('cafe_orders', { field: 'date', equals: today() });
  const [users] = useData('users');
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState((settings.paymentMethods || ['كاش'])[0]);
  const [note, setNote] = useState('');
  const [printAfter, setPrintAfter] = useState(true);
  const [confirm, setConfirm] = useState(null);

  const active = items.filter((i) => i.active);
  const cats = [...new Set(active.map((i) => i.category || 'أخرى'))];
  const shown = cat === 'all' ? active : active.filter((i) => (i.category || 'أخرى') === cat);
  const canDiscount = can('cafe.discount');

  const add = (it) => setCart((c) => {
    const ex = c.find((x) => x.item_id === it.id);
    if (ex) return c.map((x) => (x.item_id === it.id ? { ...x, qty: x.qty + 1 } : x));
    return [...c, { item_id: it.id, name: it.name, price: Number(it.price) || 0, qty: 1 }];
  });
  const changeQty = (id, d) => setCart((c) => c.map((x) => (x.item_id === id ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const disc = canDiscount ? Math.min(Number(discount) || 0, subtotal) : 0;
  const total = subtotal - disc;

  const sell = async () => {
    if (!cart.length) return;
    const number = orders.length + 1;
    try {
      const o = await act(() => api.put('cafe_orders', { date: today(), time: nowTime(), number, items: cart, subtotal, discount: disc, total, method, note }), `تم تسجيل الطلب #${number}`);
      if (printAfter) {
        printReceipt({
          settings: { ...settings, currency },
          title: 'فاتورة كافيه',
          number: String(number),
          meta: [['التاريخ', o.date], ['الوقت', time12(o.time)], ['الكاشير', user.name]],
          items: cart,
          totals: disc ? [['المجموع', subtotal], ['خصم', -disc]] : [],
          grand: ['الإجمالي', total],
          payment: method,
          note,
        });
      }
      setCart([]); setDiscount(''); setNote('');
    } catch { /* toast shown */ }
  };

  const todays = [...orders].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const userName = (id) => users.find((u) => u.id === id)?.name || '';

  return (
    <>
      <div className="pos">
        <Panel
          title="المنيو"
          actions={cats.length > 1 && (
            <div className="chips">
              <button className={`chip ${cat === 'all' ? 'selected' : ''}`} onClick={() => setCat('all')}>الكل</button>
              {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'selected' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
            </div>
          )}
        >
          {shown.length === 0 ? <Empty icon={Coffee}>لا توجد أصناف — تضاف من الإعدادات</Empty> : (
            <div className="tiles">
              {shown.map((it) => {
                const inCart = cart.find((x) => x.item_id === it.id);
                return (
                  <button key={it.id} className={`tile ${inCart ? 'selected' : ''}`} onClick={() => add(it)}>
                    {inCart && <span className="count">{inCart.qty}</span>}
                    <strong>{it.name}</strong>
                    <span className="price num">{money(it.price, currency)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="الطلب" meta={cart.length ? `${cart.reduce((s, i) => s + i.qty, 0)} صنف` : null} className="checkout"
          actions={cart.length > 0 && <button className="btn btn-sm btn-quiet" onClick={() => setCart([])}>تفريغ</button>}>
          {cart.length === 0 ? <Empty icon={Receipt}>اختر الأصناف من المنيو</Empty> : (
            <div className="line-items">
              {cart.map((i) => (
                <div key={i.item_id} className="line-item">
                  <span>{i.name}</span>
                  <div className="qty">
                    <button onClick={() => changeQty(i.item_id, 1)} aria-label="زيادة"><Plus /></button>
                    <span className="num">{i.qty}</span>
                    <button onClick={() => changeQty(i.item_id, -1)} aria-label="نقص"><Minus /></button>
                  </div>
                  <span className="amt num">{num(i.price * i.qty)}</span>
                </div>
              ))}
            </div>
          )}
          {canDiscount && cart.length > 0 && <MoneyInput value={discount} onChange={setDiscount} placeholder="خصم" />}
          <div className="total-line"><span>الإجمالي</span><strong className="num">{money(total, currency)}</strong></div>
          <MethodSelect value={method} onChange={setMethod} methods={settings.paymentMethods} />
          <input placeholder="رقم الترابيزة أو ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="check"><input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} />طباعة الفاتورة</label>
          <button className="btn btn-primary btn-lg btn-block" disabled={!cart.length} onClick={sell}>تأكيد الطلب</button>
        </Panel>
      </div>
      <Panel body={false} title="طلبات اليوم" meta={todays.length ? `${todays.length} · ${money(todays.reduce((s, o) => s + (Number(o.total) || 0), 0), currency)}` : null}>
        {todays.length === 0 ? <Empty>لا توجد طلبات اليوم</Empty> : (
          <table className="table">
            <thead><tr><th>#</th><th>الوقت</th><th>الأصناف</th><th>الدفع</th><th>الموظف</th><th className="end">المبلغ</th>{can('cafe.delete') && <th />}</tr></thead>
            <tbody>
              {todays.map((o) => (
                <tr key={o.id}>
                  <td className="num muted">{o.number}</td>
                  <td className="num">{time12(o.time)}</td>
                  <td>{(o.items || []).map((i) => `${i.name} × ${i.qty}`).join('، ')}{o.note ? <span className="muted"> · {o.note}</span> : ''}</td>
                  <td className="muted">{o.method}</td>
                  <td className="muted">{userName(o.created_by)}</td>
                  <td className="end num strong">{num(o.total)}</td>
                  {can('cafe.delete') && <td className="actions"><button className="icon-btn danger" title="حذف" onClick={() => setConfirm(o)}><Trash2 /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {confirm && <Confirm title="حذف طلب" confirmText="حذف" message={`حذف الطلب #${confirm.number} بقيمة ${money(confirm.total, currency)}؟`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('cafe_orders', confirm.id), 'تم الحذف')} />}
    </>
  );
}

function CafeAccounts() {
  const { currency, can } = useApp();
  const act = useAction();
  const [range, setRange] = useState({ from: can('finance.view_all') ? startOfMonth() : today(), to: today() });
  const opts = { field: 'date', from: range.from, to: range.to };
  const [orders] = useData('cafe_orders', opts, [range.from, range.to]);
  const [txs] = useData('transactions', opts, [range.from, range.to]);
  const [users] = useData('users');
  const [confirm, setConfirm] = useState(null);

  const cafeTx = txs.filter((t) => t.section === 'cafe');
  const sales = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const otherIn = cafeTx.filter((t) => t.type === 'in').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const out = cafeTx.filter((t) => t.type === 'out').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const net = sales + otherIn - out;

  const bestSellers = useMemo(() => {
    const m = {};
    for (const o of orders) for (const i of o.items || []) {
      const r = (m[i.name] ||= { name: i.name, qty: 0, total: 0 });
      r.qty += Number(i.qty) || 0; r.total += (Number(i.price) || 0) * (Number(i.qty) || 0);
    }
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [orders]);

  const userName = (id) => users.find((u) => u.id === id)?.name || '';

  return (
    <>
      <RangePicker value={range} onChange={setRange} />
      <Metrics>
        <Metric label="مبيعات الكاشير" amount={sales} currency={currency} sub={`${orders.length} طلب`} />
        <Metric label="إيرادات أخرى" amount={otherIn} currency={currency} />
        <Metric label="مصروفات" amount={out} currency={currency} />
        <Metric label="صافي الكافيه" amount={net} currency={currency} tone={net < 0 ? 'danger' : 'ok'} />
      </Metrics>
      <div className="cols-2">
        <Panel body={false} title="المصروفات والإيرادات اليدوية" meta={cafeTx.length || null}>
          {cafeTx.length === 0 ? <Empty>لا توجد حركات في هذه الفترة</Empty> : (
            <table className="table">
              <thead><tr><th>التاريخ</th><th>البند</th><th>بواسطة</th><th className="end">المبلغ</th>{can('finance.delete') && <th />}</tr></thead>
              <tbody>
                {[...cafeTx].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                  <tr key={t.id}>
                    <td className="num">{t.date}</td>
                    <td><div className="cell-title">{t.category}</div>{t.note && <div className="cell-sub">{t.note}</div>}</td>
                    <td className="muted">{userName(t.created_by)}</td>
                    <td className={`end num strong ${t.type === 'in' ? 'text-ok' : ''}`}><span className="signed">{t.type === 'in' ? '+' : '−'}{num(t.amount)}</span></td>
                    {can('finance.delete') && <td className="actions"><button className="icon-btn danger" title="حذف" onClick={() => setConfirm(t)}><Trash2 /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel body={false} title="الأكثر مبيعاً">
          {bestSellers.length === 0 ? <Empty /> : (
            <table className="table compact">
              <thead><tr><th>الصنف</th><th className="end">الكمية</th><th className="end">القيمة</th></tr></thead>
              <tbody>{bestSellers.map((b) => <tr key={b.name}><td>{b.name}</td><td className="end num">{b.qty}</td><td className="end num">{num(b.total)}</td></tr>)}</tbody>
            </table>
          )}
        </Panel>
      </div>
      {confirm && <Confirm title="حذف حركة" confirmText="حذف" message={`حذف "${confirm.category}" بقيمة ${money(confirm.amount, currency)}؟`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('transactions', confirm.id), 'تم الحذف')} />}
    </>
  );
}
