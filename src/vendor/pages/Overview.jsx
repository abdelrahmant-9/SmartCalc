import { useMemo, useState } from 'react';
import { BellRing, Plus } from 'lucide-react';
import { useRows, statusOf, remainingLabel } from '../state.jsx';
import { MONTHS, money, num, today } from '../../lib/format.js';
import BarChart from '../../components/BarChart.jsx';
import { Empty, Metric, Metrics, Page, Panel } from '../../components/ui.jsx';
import { CustomerDetail, CustomerForm, KeyModal, RenewModal, StatusTag } from './Customers.jsx';

export default function Overview({ navigate }) {
  const customers = useRows('customers');
  const payments = useRows('payments');
  const [renewFor, setRenewFor] = useState(null);
  const [keyResult, setKeyResult] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);

  const withStatus = customers.map((c) => ({ c, s: statusOf(c) }));
  const paying = withStatus.filter(({ s }) => ['active', 'expiring', 'grace'].includes(s.key));
  const mrr = paying.filter(({ c }) => c.type === 'subscription').reduce((a, { c }) => a + (Number(c.price) || 0), 0);
  const month = today().slice(0, 7);
  const thisMonth = payments.filter((p) => p.date.startsWith(month)).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const allTime = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const attention = withStatus.filter(({ s }) => ['expiring', 'grace', 'expired'].includes(s.key)).sort((a, b) => a.s.days - b.s.days);
  const count = (k) => withStatus.filter(({ s }) => s.key === k).length;

  const chart = useMemo(() => {
    const [y, m] = today().split('-').map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(y, m - 1 - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const value = payments.filter((p) => p.date.startsWith(key)).reduce((a, p) => a + (Number(p.amount) || 0), 0);
      return { key, label: MONTHS[d.getMonth()].slice(0, 3), title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, value };
    });
  }, [payments]);

  const open = customers.find((c) => c.id === openId);

  return (
    <Page title="نظرة عامة" sub="اشتراكات العملاء والدخل" actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus />عميل جديد</button>}>
      <Metrics>
        <Metric label="عملاء شغالين" value={num(paying.length + count('perpetual'))} sub={`${count('perpetual')} شراء نهائي · ${paying.length} اشتراك`} />
        <Metric label="الدخل الشهري المتكرر" amount={mrr} currency="ج.م" sub="مجموع اشتراكات العملاء السارية" />
        <Metric label="اتحصّل الشهر ده" amount={thisMonth} currency="ج.م" sub={`الإجمالي من الأول ${money(allTime)}`} />
        <Metric label="محتاج متابعة" value={num(attention.length)} tone={attention.length ? 'warn' : undefined} sub={`${count('expiring')} قرّب · ${count('grace') + count('expired')} انتهى`} />
      </Metrics>

      <div className="cols-2">
        <Panel body={false} title="محتاج تجديد" meta={attention.length || null}
          actions={attention.length > 0 && <button className="btn btn-sm btn-quiet" onClick={() => navigate('customers')}>كل العملاء</button>}>
          {attention.length === 0 ? <Empty icon={BellRing}>مفيش اشتراكات قرّبت تنتهي</Empty> : (
            <table className="table">
              <tbody>
                {attention.map(({ c, s }) => (
                  <tr key={c.id}>
                    <td className="clickable" onClick={() => setOpenId(c.id)}><div className="cell-title">{c.name}</div><div className="cell-sub">{c.venue}</div></td>
                    <td><StatusTag c={c} /></td>
                    <td className={`nowrap ${s.tone === 'warn' ? 'text-warn' : 'text-danger'}`}>{remainingLabel(s)}</td>
                    <td className="end num">{money(c.price)}</td>
                    <td className="actions"><div><button className="btn btn-sm btn-primary" onClick={() => setRenewFor(c)}>تجديد</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel body={false} title="الدخل آخر 12 شهر">
          <BarChart data={chart} currency="ج.م" height={220} empty="لسه مفيش مدفوعات" />
        </Panel>
      </div>

      {renewFor && <RenewModal customer={renewFor} onClose={() => setRenewFor(null)} onDone={(r) => { setRenewFor(null); setKeyResult(r); }} />}
      {keyResult && <KeyModal result={keyResult} customer={keyResult.customer} onClose={() => setKeyResult(null)} />}
      {open && <CustomerDetail customer={open} onClose={() => setOpenId(null)} />}
      {adding && <CustomerForm initial={{}} onClose={() => setAdding(false)} />}
    </Page>
  );
}
