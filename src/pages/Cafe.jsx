import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { money, nowTime, startOfMonth, time12, today } from '../lib/format.js';
import { printReceipt } from '../lib/print.js';
import { Confirm, Empty, MoneyInput, MethodSelect, PageHead, Stat, Tabs } from '../components/ui.jsx';
import { TransactionForm, RangePicker } from './Finance.jsx';

export default function Cafe() {
  const [tab, setTab] = useState('pos');
  return (
    <>
      <PageHead title="الكافيه" sub="الكاشير وحسابات الكافيه" />
      <Tabs tabs={[{ id: 'pos', label: 'الكاشير' }, { id: 'accounts', label: 'حسابات الكافيه' }]} value={tab} onChange={setTab} />
      {tab === 'pos' ? <Pos /> : <CafeAccounts />}
    </>
  );
}

function Pos() {
  const { settings, currency, isAdmin, user } = useApp();
  const act = useAction();
  const [items] = useData('cafe_items');
  const [orders] = useData('cafe_orders', { field: 'date', equals: today() });
  const [users] = useData('users');
  const [cat, setCat] = useState('الكل');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState((settings.paymentMethods || ['كاش'])[0]);
  const [note, setNote] = useState('');
  const [printAfter, setPrintAfter] = useState(true);
  const [confirm, setConfirm] = useState(null);

  const active = items.filter((i) => i.active);
  const cats = ['الكل', ...new Set(active.map((i) => i.category || 'أخرى'))];
  const shown = cat === 'الكل' ? active : active.filter((i) => (i.category || 'أخرى') === cat);
  const canDiscount = isAdmin || settings.allowEmployeeDiscount;

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
      const o = await act(() => api.put('cafe_orders', { date: today(), time: nowTime(), number, items: cart, subtotal, discount: disc, total, method, note }), 'تم تسجيل الفاتورة');
      if (printAfter) {
        printReceipt({
          venueName: settings.venueName, title: `فاتورة كافيه #${number}`,
          lines: [['التاريخ', `${o.date} ${time12(o.time)}`], ['الموظف', user.name]],
          items: cart.map((i) => ({ name: i.name, qty: i.qty, total: money(i.price * i.qty, currency) })),
          totals: [
            ...(disc ? [['المجموع', money(subtotal, currency)], ['خصم', money(disc, currency)]] : []),
            ['الإجمالي', money(total, currency), true], ['الدفع', method],
          ],
          footer: settings.receiptFooter,
        });
      }
      setCart([]); setDiscount(''); setNote('');
    } catch { /* toast shown */ }
  };

  const todays = [...orders].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const userName = (id) => users.find((u) => u.id === id)?.name || '';

  return (
    <>
      <div className="pos-layout">
        <div className="card">
          <div className="chips">
            {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'selected' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          {shown.length === 0 ? <Empty>لا توجد أصناف — أضفها من الإعدادات ← المنيو</Empty> : (
            <div className="menu-grid">
              {shown.map((it) => {
                const inCart = cart.find((x) => x.item_id === it.id);
                return (
                  <button key={it.id} className={`menu-item ${inCart ? 'selected' : ''}`} onClick={() => add(it)}>
                    {inCart && <span className="menu-qty">{inCart.qty}</span>}
                    <strong>{it.name}</strong>
                    <span>{money(it.price, currency)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="card checkout">
          <h3>الطلب الحالي</h3>
          {cart.length === 0 ? <Empty>اضغط على الأصناف لإضافتها</Empty> : (
            <div className="cart">
              {cart.map((i) => (
                <div key={i.item_id} className="cart-row">
                  <span className="cart-name">{i.name}</span>
                  <div className="stepper small">
                    <button onClick={() => changeQty(i.item_id, -1)}>−</button>
                    <span>{i.qty}</span>
                    <button onClick={() => changeQty(i.item_id, 1)}>+</button>
                  </div>
                  <span className="cart-total">{money(i.price * i.qty, currency)}</span>
                </div>
              ))}
            </div>
          )}
          {canDiscount && <MoneyInput value={discount} onChange={setDiscount} placeholder="خصم (اختياري)" />}
          <div className="checkout-total"><span>الإجمالي</span><strong>{money(total, currency)}</strong></div>
          <MethodSelect value={method} onChange={setMethod} methods={settings.paymentMethods} />
          <input placeholder="ملاحظة / رقم الترابيزة" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="check"><input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} /> طباعة الفاتورة</label>
          <div className="row">
            <button className="btn" onClick={() => setCart([])} disabled={!cart.length}>مسح</button>
            <button className="btn btn-primary btn-lg grow" disabled={!cart.length} onClick={sell}>تأكيد البيع</button>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>فواتير اليوم ({todays.length}) — {money(todays.reduce((s, o) => s + (Number(o.total) || 0), 0), currency)}</h3>
        {todays.length === 0 ? <Empty>لا توجد فواتير اليوم</Empty> : (
          <table className="table">
            <thead><tr><th>#</th><th>الوقت</th><th>الأصناف</th><th>الإجمالي</th><th>الدفع</th><th>الموظف</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {todays.map((o) => (
                <tr key={o.id}>
                  <td>{o.number}</td>
                  <td>{time12(o.time)}</td>
                  <td>{(o.items || []).map((i) => `${i.name} × ${i.qty}`).join('، ')}</td>
                  <td>{money(o.total, currency)}</td>
                  <td>{o.method}</td>
                  <td>{userName(o.created_by)}</td>
                  {isAdmin && <td><button className="icon-btn" title="حذف" onClick={() => setConfirm(o)}>🗑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {confirm && <Confirm message={`حذف فاتورة #${confirm.number} بقيمة ${money(confirm.total, currency)}؟`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('cafe_orders', confirm.id), 'تم الحذف')} />}
    </>
  );
}

function CafeAccounts() {
  const { currency, isAdmin, settings } = useApp();
  const act = useAction();
  const [range, setRange] = useState({ from: isAdmin ? startOfMonth() : today(), to: today() });
  const opts = { field: 'date', from: range.from, to: range.to };
  const [orders] = useData('cafe_orders', opts, [range.from, range.to]);
  const [txs] = useData('transactions', opts, [range.from, range.to]);
  const [users] = useData('users');
  const [form, setForm] = useState(null);
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
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [orders]);

  const userName = (id) => users.find((u) => u.id === id)?.name || '';
  const canExpense = isAdmin || settings.allowEmployeeExpenses;

  return (
    <>
      <div className="toolbar">
        <RangePicker value={range} onChange={setRange} />
        <span className="spacer" />
        {isAdmin && <button className="btn" onClick={() => setForm({ type: 'in', section: 'cafe' })}>+ إيراد كافيه</button>}
        {canExpense && <button className="btn btn-primary" onClick={() => setForm({ type: 'out', section: 'cafe' })}>+ مصروف كافيه</button>}
      </div>
      <div className="stats">
        <Stat label="مبيعات الكاشير" value={money(sales, currency)} sub={`${orders.length} فاتورة`} />
        <Stat label="إيرادات أخرى" value={money(otherIn, currency)} />
        <Stat label="مصروفات الكافيه" value={money(out, currency)} tone="danger" />
        <Stat label="صافي الكافيه" value={money(net, currency)} tone={net >= 0 ? 'ok' : 'danger'} />
      </div>
      <div className="two-col">
        <div className="card">
          <h3>حركات الكافيه (إيرادات ومصروفات يدوية)</h3>
          {cafeTx.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>التاريخ</th><th>النوع</th><th>البند</th><th>المبلغ</th><th>بواسطة</th>{isAdmin && <th />}</tr></thead>
              <tbody>
                {[...cafeTx].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td className={t.type === 'in' ? 'text-ok' : 'text-danger'}>{t.type === 'in' ? 'إيراد' : 'مصروف'}</td>
                    <td>{t.category}{t.note ? ` — ${t.note}` : ''}</td>
                    <td>{money(t.amount, currency)}</td>
                    <td>{userName(t.created_by)}</td>
                    {isAdmin && <td><button className="icon-btn" onClick={() => setConfirm(t)}>🗑</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>الأكثر مبيعاً</h3>
          {bestSellers.length === 0 ? <Empty /> : (
            <table className="table compact">
              <thead><tr><th>الصنف</th><th>الكمية</th><th>القيمة</th></tr></thead>
              <tbody>{bestSellers.map((b) => <tr key={b.name}><td>{b.name}</td><td>{b.qty}</td><td>{money(b.total, currency)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
      {form && <TransactionForm initial={form} lockSection onClose={() => setForm(null)} />}
      {confirm && <Confirm message="حذف هذه الحركة؟" onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('transactions', confirm.id), 'تم الحذف')} />}
    </>
  );
}
