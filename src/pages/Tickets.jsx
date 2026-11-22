import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { money, nowTime, time12, today } from '../lib/format.js';
import { printReceipt } from '../lib/print.js';
import { Confirm, Empty, MethodSelect, PageHead, Stat } from '../components/ui.jsx';

export default function Tickets() {
  const { settings, currency, isAdmin, user } = useApp();
  const act = useAction();
  const [types] = useData('ticket_types');
  const [day, setDay] = useState(today());
  const [sales] = useData('ticket_sales', { field: 'date', equals: day }, [day]);
  const [users] = useData('users');
  const [qty, setQty] = useState({});
  const [method, setMethod] = useState((settings.paymentMethods || ['كاش'])[0]);
  const [note, setNote] = useState('');
  const [printAfter, setPrintAfter] = useState(true);
  const [confirm, setConfirm] = useState(null);

  const active = types.filter((t) => t.active);
  const items = active.filter((t) => qty[t.id] > 0).map((t) => ({ type_id: t.id, name: t.name, price: Number(t.price) || 0, qty: qty[t.id] }));
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const inc = (id, d) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) + d) }));

  const sell = async () => {
    if (!items.length) return;
    try {
      const sale = await act(() => api.put('ticket_sales', { date: today(), time: nowTime(), items, total, method, note }), 'تم تسجيل التذاكر');
      if (printAfter) {
        printReceipt({
          venueName: settings.venueName, title: 'تذكرة دخول',
          lines: [['التاريخ', `${sale.date} ${time12(sale.time)}`], ['الموظف', user.name]],
          items: items.map((i) => ({ name: i.name, qty: i.qty, total: money(i.price * i.qty, currency) })),
          totals: [['الإجمالي', money(total, currency), true], ['الدفع', method]],
          footer: settings.receiptFooter,
        });
      }
      setQty({}); setNote('');
    } catch { /* toast already shown */ }
  };

  const daySales = [...sales].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const dayCount = daySales.reduce((s, x) => s + (x.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0), 0);
  const dayTotal = daySales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const userName = (id) => users.find((u) => u.id === id)?.name || '';

  return (
    <>
      <PageHead title="تذاكر الدخول" sub={isAdmin ? 'أسعار التذاكر تتعدل من الإعدادات' : 'اختر نوع وعدد التذاكر ثم اضغط بيع'} />
      <div className="pos-layout">
        <div className="card">
          {active.length === 0 ? <Empty>لا توجد أنواع تذاكر — أضفها من الإعدادات</Empty> : (
            <div className="ticket-grid">
              {active.map((t) => (
                <div key={t.id} className={`ticket-card ${qty[t.id] ? 'selected' : ''}`}>
                  <button className="ticket-main" onClick={() => inc(t.id, 1)}>
                    <strong>{t.name}</strong>
                    <span className="ticket-price">{money(t.price, currency)}</span>
                  </button>
                  <div className="stepper">
                    <button onClick={() => inc(t.id, -1)} aria-label="نقص">−</button>
                    <input type="number" min="0" value={qty[t.id] || 0} onChange={(e) => setQty({ ...qty, [t.id]: Math.max(0, Number(e.target.value) || 0) })} />
                    <button onClick={() => inc(t.id, 1)} aria-label="زود">+</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card checkout">
          <h3>الفاتورة</h3>
          {items.length === 0 ? <Empty>لم يتم اختيار تذاكر</Empty> : (
            <table className="table compact">
              <tbody>{items.map((i) => <tr key={i.type_id}><td>{i.name}</td><td>× {i.qty}</td><td>{money(i.price * i.qty, currency)}</td></tr>)}</tbody>
            </table>
          )}
          <div className="checkout-total"><span>الإجمالي</span><strong>{money(total, currency)}</strong></div>
          <MethodSelect value={method} onChange={setMethod} methods={settings.paymentMethods} />
          <input placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="check"><input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} /> طباعة بعد البيع</label>
          <button className="btn btn-primary btn-lg btn-block" disabled={!items.length} onClick={sell}>بيع</button>
        </div>
      </div>

      <div className="card">
        <div className="row-between">
          <h3>مبيعات يوم</h3>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value || today())} />
        </div>
        <div className="stats stats-inline">
          <Stat label="عدد التذاكر" value={dayCount} />
          <Stat label="إجمالي التذاكر" value={money(dayTotal, currency)} tone="ok" />
        </div>
        {daySales.length === 0 ? <Empty>لا توجد مبيعات</Empty> : (
          <table className="table">
            <thead><tr><th>الوقت</th><th>التذاكر</th><th>الإجمالي</th><th>الدفع</th><th>الموظف</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {daySales.map((s) => (
                <tr key={s.id}>
                  <td>{time12(s.time)}</td>
                  <td>{(s.items || []).map((i) => `${i.name} × ${i.qty}`).join('، ')}</td>
                  <td>{money(s.total, currency)}</td>
                  <td>{s.method}</td>
                  <td>{userName(s.created_by)}</td>
                  {isAdmin && <td><button className="icon-btn" title="حذف" onClick={() => setConfirm(s)}>🗑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {confirm && <Confirm message={`حذف عملية بيع بقيمة ${money(confirm.total, currency)}؟`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('ticket_sales', confirm.id), 'تم الحذف')} />}
    </>
  );
}
