import { useMemo } from 'react';
import { CalendarHeart, CalendarDays, Coffee, Plus, Ticket } from 'lucide-react';
import { useApp, useData } from '../lib/context.jsx';
import { addDays, durationLabel, latin, money, prettyDate, startOfMonth, time12, today } from '../lib/format.js';
import { movements, paidFor, SECTION_LABELS, summarize } from '../lib/finance.js';
import { Empty, Metric, Metrics, Notice, Page, Panel, StatusBadge } from '../components/ui.jsx';
import BarChart from '../components/BarChart.jsx';

const DAYS_IN_CHART = 14;

export default function Dashboard({ navigate }) {
  const { isAdmin, currency, syncStatus } = useApp();
  const t = today();
  const from = [startOfMonth(t), addDays(t, -(DAYS_IN_CHART - 1))].sort()[0];
  const rangeOpts = { field: 'date', from, to: t };
  const deps = [from, t];
  const [bookings] = useData('bookings');
  const [payments] = useData('payments');
  const [ticketSales] = useData('ticket_sales', rangeOpts, deps);
  const [cafeOrders] = useData('cafe_orders', rangeOpts, deps);
  const [transactions] = useData('transactions', rangeOpts, deps);

  const all = useMemo(() => movements({
    payments: payments.filter((p) => p.date >= from && p.date <= t), ticketSales, cafeOrders, transactions, bookings,
  }), [payments, ticketSales, cafeOrders, transactions, bookings, from, t]);

  const monthStart = startOfMonth(t);
  const todayS = summarize(all.filter((m) => m.date === t));
  const monthS = summarize(all.filter((m) => m.date >= monthStart));

  const chartData = useMemo(() => {
    const byDay = summarize(all).byDay;
    return Array.from({ length: DAYS_IN_CHART }, (_, i) => {
      const d = addDays(t, -(DAYS_IN_CHART - 1 - i));
      return { key: d, label: Number(d.slice(8)), title: prettyDate(d), value: byDay[d]?.in || 0 };
    });
  }, [all, t]);

  const active = bookings.filter((b) => !['cancelled', 'no_show'].includes(b.status));
  const todays = active.filter((b) => b.date === t).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const upcoming = active.filter((b) => b.date > t && b.date <= addDays(t, 7))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));
  const ticketsToday = ticketSales.filter((s) => s.date === t).reduce((n, s) => n + (s.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0), 0);
  const ordersToday = cafeOrders.filter((o) => o.date === t);

  return (
    <Page
      title="الرئيسية"
      sub={prettyDate(t)}
      actions={(
        <>
          <button className="btn" onClick={() => navigate('tickets')}><Ticket />بيع تذاكر</button>
          <button className="btn" onClick={() => navigate('cafe')}><Coffee />طلب كافيه</button>
          <button className="btn btn-primary" onClick={() => navigate('bookings')}><Plus />حجز</button>
        </>
      )}
    >
      {isAdmin && syncStatus?.state === 'off' && (
        <Notice tone="info">
          البيانات محفوظة على هذا الجهاز فقط.
          <span className="spacer" />
          <button className="link" onClick={() => navigate('settings')}>ربط الأجهزة</button>
        </Notice>
      )}

      <Metrics>
        <Metric label="حجوزات اليوم" value={todays.length} sub={`${upcoming.length} خلال 7 أيام`} />
        <Metric label="تذاكر اليوم" value={ticketsToday} />
        {isAdmin ? (
          <>
            <Metric label="دخل اليوم" amount={todayS.in} currency={currency} sub={`مصروفات ${money(todayS.out, currency)}`} />
            <Metric label="صافي الشهر" amount={monthS.net} currency={currency} tone={monthS.net < 0 ? 'danger' : undefined} sub={`دخل ${money(monthS.in, currency)}`} />
          </>
        ) : (
          <Metric label="طلبات الكافيه اليوم" value={ordersToday.length} />
        )}
      </Metrics>

      {isAdmin && (
        <Panel title="الدخل اليومي" meta={`آخر ${DAYS_IN_CHART} يوم`} body={false}>
          <Metrics flat>
            {Object.entries(SECTION_LABELS).map(([k, label]) => {
              const v = todayS.bySection[k] || { in: 0, out: 0 };
              return <Metric key={k} label={`${label} — اليوم`} amount={v.in - v.out} currency={currency} tone={v.in - v.out < 0 ? 'danger' : undefined} />;
            })}
          </Metrics>
          <BarChart data={chartData} currency={currency} />
        </Panel>
      )}

      <div className="cols-2">
        <Panel title="مواعيد اليوم" meta={todays.length || null} body={false}>
          {todays.length === 0 ? <Empty icon={CalendarHeart}>لا توجد مواعيد اليوم</Empty> : (
            <div className="agenda">
              {todays.map((b) => {
                const rem = (Number(b.total) || 0) - paidFor(b.id, payments);
                return (
                  <div key={b.id} className="agenda-item">
                    <div className="agenda-time">{time12(b.start_time)}<small>{durationLabel(b.duration_minutes)}</small></div>
                    <div>
                      <div className="agenda-name">{b.bride_name}{b.groom_name ? ` و${b.groom_name}` : ''}</div>
                      <div className="agenda-meta">{b.package_name} · <span className="mono">{latin(b.phone)}</span></div>
                    </div>
                    <div className="agenda-side">
                      <StatusBadge status={b.status} />
                      <span className={rem > 0 ? 'text-danger' : 'muted'}>{rem > 0 ? `متبقي ${money(rem, currency)}` : 'مدفوع بالكامل'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="الأيام القادمة" body={false}>
          {upcoming.length === 0 ? <Empty icon={CalendarDays}>لا توجد حجوزات خلال الأسبوع</Empty> : (
            <table className="table compact plain">
              <tbody>
                {upcoming.slice(0, 10).map((b) => (
                  <tr key={b.id}>
                    <td><div className="cell-title">{prettyDate(b.date).split(' ').slice(0, 3).join(' ')}</div></td>
                    <td className="num">{time12(b.start_time)}</td>
                    <td>{b.bride_name}</td>
                    <td className="end"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </Page>
  );
}
