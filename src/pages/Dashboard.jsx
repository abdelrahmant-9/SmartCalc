import { useMemo } from 'react';
import { useApp, useData } from '../lib/context.jsx';
import { addDays, durationLabel, money, prettyDate, startOfMonth, time12, today } from '../lib/format.js';
import { movements, paidFor, SECTION_LABELS, summarize } from '../lib/finance.js';
import { Empty, PageHead, Stat, StatusBadge } from '../components/ui.jsx';

export default function Dashboard({ navigate }) {
  const { user, isAdmin, currency, syncStatus, settings } = useApp();
  const t = today();
  const monthStart = startOfMonth(t);
  const rangeOpts = { field: 'date', from: monthStart, to: t };
  const [bookings] = useData('bookings');
  const [payments] = useData('payments');
  const [ticketSales] = useData('ticket_sales', rangeOpts, [monthStart, t]);
  const [cafeOrders] = useData('cafe_orders', rangeOpts, [monthStart, t]);
  const [transactions] = useData('transactions', rangeOpts, [monthStart, t]);

  const monthPayments = payments.filter((p) => p.date >= monthStart && p.date <= t);
  const all = useMemo(
    () => movements({ payments: monthPayments, ticketSales, cafeOrders, transactions, bookings }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, ticketSales, cafeOrders, transactions, bookings],
  );
  const todayS = summarize(all.filter((m) => m.date === t));
  const monthS = summarize(all);

  const active = bookings.filter((b) => !['cancelled', 'no_show'].includes(b.status));
  const todays = active.filter((b) => b.date === t).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const upcoming = active.filter((b) => b.date > t && b.date <= addDays(t, 7))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));
  const ticketsToday = ticketSales.filter((s) => s.date === t).reduce((n, s) => n + (s.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0), 0);
  const monthBookings = active.filter((b) => b.date >= monthStart && b.date.slice(0, 7) === t.slice(0, 7)).length;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';

  return (
    <>
      <PageHead title={`${greet}، ${user.name}`} sub={prettyDate(t)}>
        <button className="btn" onClick={() => navigate('tickets')}>بيع تذاكر</button>
        <button className="btn" onClick={() => navigate('cafe')}>الكافيه</button>
        <button className="btn btn-primary" onClick={() => navigate('bookings')}>الحجوزات</button>
      </PageHead>

      {isAdmin && syncStatus?.state === 'off' && (
        <div className="alert alert-info">
          المزامنة الأونلاين غير مفعّلة — البيانات محفوظة على هذا الجهاز فقط.{' '}
          <button className="link" onClick={() => navigate('settings')}>فعّلها من الإعدادات</button>
        </div>
      )}

      <div className="stats">
        <Stat label="حجوزات اليوم" value={todays.length} sub={`${upcoming.length} خلال الأسبوع القادم`} />
        <Stat label="تذاكر اليوم" value={ticketsToday} />
        {isAdmin ? (
          <>
            <Stat label="دخل اليوم" value={money(todayS.in, currency)} sub={`مصروفات ${money(todayS.out, currency)}`} tone="ok" />
            <Stat label="صافي الشهر" value={money(monthS.net, currency)} sub={`${monthBookings} حجز هذا الشهر`} tone={monthS.net >= 0 ? 'ok' : 'danger'} />
          </>
        ) : (
          <Stat label="مبيعات الكافيه اليوم" value={cafeOrders.filter((o) => o.date === t).length} sub="فاتورة" />
        )}
      </div>

      {isAdmin && (
        <div className="card">
          <h3>دخل اليوم حسب القسم</h3>
          <div className="stats stats-inline">
            {Object.entries(SECTION_LABELS).map(([k, label]) => {
              const v = todayS.bySection[k] || { in: 0, out: 0 };
              return <Stat key={k} label={label} value={money(v.in - v.out, currency)} />;
            })}
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <h3>عرائس النهارده</h3>
          {todays.length === 0 ? <Empty>مفيش حجوزات النهارده</Empty> : (
            <div className="day-list">
              {todays.map((b) => {
                const rem = (Number(b.total) || 0) - paidFor(b.id, payments);
                return (
                  <div key={b.id} className="booking-row static">
                    <div className="booking-time">{time12(b.start_time)}<small>{durationLabel(b.duration_minutes)}</small></div>
                    <div className="booking-main">
                      <div className="booking-names">{b.bride_name}{b.groom_name ? ` & ${b.groom_name}` : ''}</div>
                      <div className="muted small">{b.package_name} · {b.phone}</div>
                    </div>
                    <div className="booking-side">
                      <StatusBadge status={b.status} />
                      <div className={`small ${rem > 0 ? 'text-danger' : 'text-ok'}`}>{rem > 0 ? `متبقي ${money(rem, currency)}` : 'خالص'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="card">
          <h3>الأسبوع القادم</h3>
          {upcoming.length === 0 ? <Empty>لا توجد حجوزات قادمة</Empty> : (
            <table className="table compact">
              <tbody>
                {upcoming.slice(0, 12).map((b) => (
                  <tr key={b.id}>
                    <td>{prettyDate(b.date).split(' ').slice(0, 3).join(' ')}</td>
                    <td>{time12(b.start_time)}</td>
                    <td>{b.bride_name}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {!isAdmin && <p className="muted small center">{settings.venueName} — شاشة الموظف</p>}
    </>
  );
}
