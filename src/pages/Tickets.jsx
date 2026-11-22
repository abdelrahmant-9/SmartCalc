import { useState } from 'react';
import { Minus, Plus, Receipt, Ticket, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { money, nowTime, num, time12, today } from '../lib/format.js';
import { printReceipt } from '../lib/print.js';
import { Confirm, Empty, Metric, Metrics, MethodSelect, Page, Panel } from '../components/ui.jsx';

export default function Tickets() {
  const { settings, currency, can, user } = useApp();
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
      const sale = await act(() => api.put('ticket_sales', { date: today(), time: nowTime(), items, total, method, note }), 'تم تسجيل البيع');
      if (printAfter) {
        printReceipt({
          settings: { ...settings, currency },
          title: 'تذاكر دخول',
          number: sale.id.slice(0, 6).toUpperCase(),
          meta: [['التاريخ', sale.date], ['الوقت', time12(sale.time)], ['الموظف', user.name]],
          items,
          grand: ['الإجمالي', total],
          payment: method,
          note,
        });
      }
      setQty({}); setNote('');
    } catch { /* toast already shown */ }
  };

  const daySales = [...sales].filter((x) => can('tickets.history') || x.created_by === user.id).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const dayCount = daySales.reduce((s, x) => s + (x.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0), 0);
  const dayTotal = daySales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const userName = (id) => users.find((u) => u.id === id)?.name || '';

  return (
    <Page title="تذاكر الدخول" sub={can('settings.catalog') ? 'الأسعار من الإعدادات ← التذاكر' : null}>
      <div className="pos">
        <Panel title="بيع جديد">
          {active.length === 0 ? <Empty icon={Ticket}>لا توجد أنواع تذاكر مفعّلة</Empty> : (
            <div className="ticket-grid">
              {active.map((t) => (
                <div key={t.id} className={`ticket-tile ${qty[t.id] ? 'selected' : ''}`}>
                  <button className="main-hit" onClick={() => inc(t.id, 1)}>
                    <span className="muted">{t.name}</span>
                    <span className="price num">{num(t.price)} <small className="muted">{currency}</small></span>
                  </button>
                  <div className="foot">
                    <div className="qty lg">
                      <button onClick={() => inc(t.id, 1)} aria-label="زيادة"><Plus /></button>
                      <input type="number" min="0" value={qty[t.id] || 0} onChange={(e) => setQty({ ...qty, [t.id]: Math.max(0, Number(e.target.value) || 0) })} />
                      <button onClick={() => inc(t.id, -1)} aria-label="نقص"><Minus /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="الفاتورة" className="checkout">
          {items.length === 0 ? <Empty icon={Receipt}>اختر نوع التذكرة</Empty> : (
            <div className="line-items">
              {items.map((i) => (
                <div key={i.type_id} className="line-item">
                  <span>{i.name}</span>
                  <span className="muted num">× {i.qty}</span>
                  <span className="amt num">{num(i.price * i.qty)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="total-line"><span>الإجمالي</span><strong className="num">{money(total, currency)}</strong></div>
          <MethodSelect value={method} onChange={setMethod} methods={settings.paymentMethods} />
          <input placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="check"><input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} />طباعة إيصال</label>
          <button className="btn btn-primary btn-lg btn-block" disabled={!items.length} onClick={sell}>تأكيد البيع</button>
        </Panel>
      </div>

      <Panel
        body={false} title="سجل المبيعات"
        actions={<input type="date" value={day} onChange={(e) => setDay(e.target.value || today())} />}
      >
        <Metrics flat>
          <Metric label="عدد التذاكر" value={dayCount} />
          <Metric label="عمليات البيع" value={daySales.length} />
          <Metric label="الإجمالي" amount={dayTotal} currency={currency} />
        </Metrics>
        {daySales.length === 0 ? <Empty>لا توجد مبيعات في هذا اليوم</Empty> : (
          <table className="table">
            <thead><tr><th>الوقت</th><th>التذاكر</th><th>الدفع</th><th>الموظف</th><th className="end">المبلغ</th>{can('tickets.delete') && <th />}</tr></thead>
            <tbody>
              {daySales.map((s) => (
                <tr key={s.id}>
                  <td className="num">{time12(s.time)}</td>
                  <td>{(s.items || []).map((i) => `${i.name} × ${i.qty}`).join('، ')}</td>
                  <td className="muted">{s.method}</td>
                  <td className="muted">{userName(s.created_by)}</td>
                  <td className="end num strong">{num(s.total)}</td>
                  {can('tickets.delete') && <td className="actions"><button className="icon-btn danger" title="حذف" onClick={() => setConfirm(s)}><Trash2 /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {confirm && <Confirm title="حذف عملية بيع" confirmText="حذف" message={`حذف عملية بيع بقيمة ${money(confirm.total, currency)}؟`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('ticket_sales', confirm.id), 'تم الحذف')} />}
    </Page>
  );
}
