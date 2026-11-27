import { useMemo, useState } from 'react';
import { Ban, CircleCheck, Cloud, CloudOff, Copy, FileDown, KeyRound, MessageCircle, Pencil, Play, Plus, RefreshCw, Search, ShoppingBag, Trash2, Users } from 'lucide-react';
import { v } from '../vapi.js';
import { useRows, useV, statusOf, remainingLabel, daysLeft } from '../state.jsx';
import { latin, ltr, money, num, today } from '../../lib/format.js';
import Select from '../../components/Select.jsx';
import { brand } from '../../lib/brand.js';
import { Confirm, Empty, Field, Modal, MoneyInput, Notice, Page, Panel, Segmented } from '../../components/ui.jsx';

const METHODS = ['كاش', 'فودافون كاش', 'إنستاباي', 'تحويل بنكي'];
const DEFAULT_MSG = `أهلاً {name} 👋\nده مفتاح تفعيل ${brand.productName} لـ {venue}{until}:\n\n{key}\n\nمن البرنامج: الإعدادات ← الترخيص ← الصق المفتاح ← تفعيل.`;

export function waLink(phone, text) {
  const p = latin(phone || '').replace(/\D/g, '');
  const intl = p.startsWith('0') ? `2${p}` : p.startsWith('20') ? p : `20${p}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

function addMonthsIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const r = new Date(y, m - 1 + n, Math.min(d, last));
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
}

export function StatusTag({ c }) {
  const s = statusOf(c);
  return <span className={`status status-${s.tone}`}>{s.label}</span>;
}

// ------------------------------------------------------------------ key
export function KeyModal({ result, customer, onClose }) {
  const { toast } = useV();
  const settings = useRows('settings');
  const tpl = settings.find((s) => s.id === 'vendor')?.waTemplate || DEFAULT_MSG;
  const until = customer.type === 'perpetual' ? ' (ترخيص دائم)' : ` — ساري لحد ${ltr(customer.expires_at)}`;
  const msg = tpl.replace('{name}', customer.name).replace('{venue}', customer.venue || customer.name).replace('{until}', until).replace('{key}', result.key);
  const copy = (t, m) => navigator.clipboard.writeText(t).then(() => toast(m));
  return (
    <Modal title="مفتاح الترخيص" sub={`${customer.name}${customer.venue ? ` — ${customer.venue}` : ''}`} onClose={onClose} footer={(
      <>
        <span className="spacer" />
        <button className="btn" onClick={() => v.saveKeyFile({ key: result.key, name: customer.venue || customer.name }).then((p) => p && toast('تم حفظ ملف المفتاح')).catch((e) => toast(e.message, 'error'))}><FileDown />حفظ كملف</button>
        <button className="btn" onClick={() => copy(msg, 'تم نسخ الرسالة كاملة')}><Copy />نسخ الرسالة</button>
        {customer.phone && <a className="btn btn-primary" href={waLink(customer.phone, msg)} target="_blank" rel="noreferrer"><MessageCircle />إرسال واتساب</a>}
      </>
    )}>
      <Notice tone="info">
        {customer.type === 'perpetual' ? 'ترخيص دائم' : `ساري لحد ${ltr(customer.expires_at)}`} — العميل يلصقه في: الإعدادات ← الترخيص.
      </Notice>
      {result.online?.pushed && <Notice tone="info" icon={Cloud}>اتبعت للسيرفر — لو جهاز العميل متصل بالنت هيتجدد لوحده من غير ما يلصق حاجة.</Notice>}
      {result.online && !result.online.pushed && result.online.reason !== 'no-server' && <Notice tone="warn" icon={CloudOff}>مااتبعتش للسيرفر ({result.online.reason}) — ابعت المفتاح للعميل أو جرّب "رفع الكل" من الإعدادات.</Notice>}
      <div className="key-box">
        <textarea readOnly dir="ltr" className="mono" rows={6} value={result.key} onFocus={(e) => e.target.select()} />
        <button className="btn btn-sm" onClick={() => copy(result.key, 'تم نسخ المفتاح')}><Copy />نسخ المفتاح</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ renew / sell
export function RenewModal({ customer, onClose, onDone }) {
  const { toast, refresh } = useV();
  const perpetual = customer.type === 'perpetual';
  const [mode, setMode] = useState(perpetual ? 'support' : 'renew');
  const price = Number(customer.price) || 0;
  const [months, setMonths] = useState(mode === 'support' ? 12 : 1);
  const [amount, setAmount] = useState(perpetual ? '' : price);
  const [method, setMethod] = useState('كاش');
  const [supportMonths, setSupportMonths] = useState(12);
  const [busy, setBusy] = useState(false);

  const from = customer.expires_at && customer.expires_at > today() ? customer.expires_at : today();
  const newEnd = addMonthsIso(from, months);
  const pick = (n) => { setMonths(n); if (mode === 'renew') setAmount(n === 12 ? price * 10 : price * n); };

  const go = async () => {
    setBusy(true);
    try {
      const r = mode === 'renew' ? await v.renew({ customer_id: customer.id, months, amount, method })
        : mode === 'sell' ? await v.sell({ customer_id: customer.id, amount, support_months: supportMonths, method })
          : await v.support({ customer_id: customer.id, months, amount, method });
      refresh(); toast('تم — المفتاح الجديد جاهز'); onDone(r);
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  return (
    <Modal title={mode === 'sell' ? 'بيع نهائي' : mode === 'support' ? 'تجديد الدعم' : 'تجديد الاشتراك'} sub={customer.name} onClose={onClose} footer={(
      <><span className="spacer" /><button className="btn" onClick={onClose}>إلغاء</button><button className="btn btn-primary" disabled={busy} onClick={go}><KeyRound />تسجيل وإصدار المفتاح</button></>
    )}>
      <div style={{ marginBottom: 14 }}>
        <Segmented value={mode} onChange={(m) => { setMode(m); setMonths(m === 'support' ? 12 : 1); setAmount(m === 'renew' ? price : ''); }}
          options={[{ id: 'renew', label: 'اشتراك شهري' }, { id: 'sell', label: 'بيع نهائي' }, ...(perpetual ? [{ id: 'support', label: 'تجديد دعم' }] : [])]} />
      </div>
      {mode !== 'sell' && (
        <>
          <div className="field-label" style={{ marginBottom: 6 }}>المدة</div>
          <div className="chips" style={{ marginBottom: 14 }}>
            {[1, 3, 6, 12].map((n) => <button key={n} type="button" className={`chip ${months === n ? 'selected' : ''}`} onClick={() => pick(n)}>{n === 12 ? 'سنة' : n === 1 ? 'شهر' : `${n} شهور`}</button>)}
          </div>
        </>
      )}
      <div className="form-grid">
        <Field label="المبلغ المدفوع" hint={mode === 'renew' && months === 12 ? 'السنة بسعر 10 شهور — عدّل لو اتفقت على غير كده' : mode === 'renew' ? `${money(price)} × ${months}` : null}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="طريقة الدفع"><Select value={method} onChange={setMethod} options={METHODS} /></Field>
        {mode === 'sell' && (
          <Field label="دعم وتحديثات" hint="بعدها البرنامج يفضل شغال، بس الدعم بيتجدد بفلوس">
            <Select value={supportMonths} onChange={(x) => setSupportMonths(Number(x))} options={[{ value: 0, label: 'بدون' }, { value: 6, label: '6 شهور' }, { value: 12, label: 'سنة' }, { value: 24, label: 'سنتين' }]} />
          </Field>
        )}
      </div>
      {mode === 'renew' && <p className="renew-preview">من <b className="num">{ltr(from)}</b> إلى <b className="num">{ltr(newEnd)}</b></p>}
      {mode === 'support' && <p className="renew-preview">الدعم لحد <b className="num">{ltr(addMonthsIso(customer.support_until && customer.support_until > today() ? customer.support_until : today(), months))}</b></p>}
    </Modal>
  );
}

// ------------------------------------------------------------------ add / edit
export function CustomerForm({ initial, onClose }) {
  const { toast, refresh } = useV();
  const plans = useRows('plans').filter((p) => p.active || p.id === initial.plan_id);
  const [f, setF] = useState({ name: '', venue: '', phone: '', city: 'المنوفية', plan_id: '', price: '', notes: '', status: 'active', type: 'subscription', ...initial });
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }));
  const save = async () => {
    if (!f.name.trim()) return toast('اسم العميل مطلوب', 'error');
    const plan = plans.find((p) => p.id === f.plan_id);
    try {
      await v.put('customers', { ...f, name: f.name.trim(), phone: latin(f.phone), type: initial.id ? f.type : plan?.type || 'subscription', price: f.price === '' ? plan?.price || 0 : Number(f.price) });
      refresh(); toast(initial.id ? 'تم حفظ التعديلات' : 'تمت إضافة العميل'); onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={initial.id ? 'تعديل عميل' : 'عميل جديد'} onClose={onClose} footer={(
      <>{initial.id && <label className="check"><input type="checkbox" checked={f.status === 'suspended'} onChange={(e) => set('status', e.target.checked ? 'suspended' : 'active')} />موقوف</label>}
        <span className="spacer" /><button className="btn" onClick={onClose}>إلغاء</button><button className="btn btn-primary" onClick={save}>حفظ</button></>
    )}>
      <div className="form-grid">
        <Field label="اسم العميل"><input autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="صاحب المكان" /></Field>
        <Field label="اسم المكان"><input value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="بيظهر في المفتاح" /></Field>
        <Field label="التليفون (واتساب)"><input dir="ltr" value={f.phone} onChange={(e) => set('phone', latin(e.target.value))} placeholder="01xxxxxxxxx" /></Field>
        <Field label="المحافظة / المدينة"><input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="الباقة">
          <Select value={f.plan_id} placeholder="اختر الباقة" onChange={(id) => { const p = plans.find((x) => x.id === id); setF((x) => ({ ...x, plan_id: id, price: p?.price ?? x.price })); }}
            options={plans.map((p) => ({ value: p.id, label: `${p.name} — ${num(p.price)}${p.type === 'subscription' ? ' / شهر' : ''}` }))} />
        </Field>
        <Field label="السعر المتفق عليه" hint="لو مختلف عن سعر الباقة"><MoneyInput value={f.price} onChange={(x) => set('price', x)} /></Field>
        <Field label="لازم جهازه يتصل بالنت كل" hint="لو ماتصلش في المدة دي البرنامج يقف على العرض لحد ما يتصل — ده اللي بيقفل ثغرة تغيير التاريخ">
          <Select value={f.offline_days ?? ''} onChange={(x) => set('offline_days', x === '' ? undefined : Number(x))} options={[
            { value: '', label: 'الافتراضي (14 يوم للاشتراك، بدون للشراء)' }, { value: 7, label: '7 أيام' }, { value: 14, label: '14 يوم' }, { value: 30, label: '30 يوم' }, { value: 0, label: 'بدون (مش لازم نت أبداً)' },
          ]} />
        </Field>
        <Field label="ملاحظات"><input value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ detail
export function CustomerDetail({ customer: c, onClose }) {
  const { toast, refresh } = useV();
  const payments = useRows('payments').filter((p) => p.customer_id === c.id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at);
  const licenses = useRows('licenses').filter((l) => l.customer_id === c.id).sort((a, b) => b.created_at - a.created_at);
  const plans = useRows('plans');
  const [renew, setRenew] = useState(false);
  const [edit, setEdit] = useState(false);
  const [keyResult, setKeyResult] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [suspendAsk, setSuspendAsk] = useState(false);
  const [reason, setReason] = useState('');
  const s = statusOf(c);
  const setSuspended = async (on) => {
    try {
      const r = await v.suspend({ customer_id: c.id, suspended: on, reason });
      refresh(); setSuspendAsk(false);
      toast(r.online.pushed ? (on ? 'تم الإيقاف — هيتقفل عند العميل أول ما جهازه يتصل بالنت' : 'تم التشغيل — هيرجع يشتغل عند العميل أول ما يتصل بالنت')
        : `اتسجل عندك بس مااتبعتش للسيرفر: ${r.online.reason === 'no-server' ? 'اضبط سيرفر التراخيص من الإعدادات' : r.online.reason}`, r.online.pushed ? 'success' : 'error');
    } catch (e) { toast(e.message, 'error'); }
  };
  const total = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const reissue = async () => { try { setKeyResult(await v.issue(c.id)); refresh(); } catch (e) { toast(e.message, 'error'); } };
  const KIND = { subscription: 'اشتراك', purchase: 'شراء نهائي', support: 'دعم' };

  return (
    <>
      <Modal wide title={c.name} sub={[c.venue, c.city].filter(Boolean).join(' — ')} onClose={onClose} footer={(
        <>
          <button className="btn btn-danger-quiet" onClick={() => setConfirm(true)}><Trash2 />حذف</button>
          {c.status === 'suspended'
            ? <button className="btn" onClick={() => setSuspended(false)}><Play />تشغيل تاني</button>
            : <button className="btn btn-danger-quiet" onClick={() => setSuspendAsk(true)}><Ban />إيقاف المكان</button>}
          <span className="spacer" />
          <button className="btn" onClick={() => setEdit(true)}><Pencil />تعديل</button>
          <button className="btn" onClick={reissue} disabled={c.type === 'subscription' && !c.expires_at}><KeyRound />مفتاح بنفس المدة</button>
          <button className="btn btn-primary" onClick={() => setRenew(true)}>{c.type === 'perpetual' ? <><RefreshCw />تجديد الدعم</> : c.expires_at ? <><RefreshCw />تجديد</> : <><ShoppingBag />تفعيل</>}</button>
        </>
      )}>
        <div className="cust-head">
          <div className={`license-state tone-${s.tone === 'muted' ? 'muted' : s.tone}`}>
            <div><strong>{s.label}</strong><span>{remainingLabel(s)}</span></div>
          </div>
          <dl className="facts">
            <dt>النوع</dt><dd>{c.type === 'perpetual' ? 'شراء نهائي' : 'اشتراك شهري'} — {plans.find((p) => p.id === c.plan_id)?.name || '—'}</dd>
            <dt>السعر</dt><dd>{money(c.price)}{c.type === 'subscription' ? ' / شهر' : ''}</dd>
            {c.expires_at && (<><dt>ينتهي</dt><dd className="num">{c.expires_at}</dd></>)}
            {c.support_until && (<><dt>الدعم لحد</dt><dd className="num">{c.support_until}</dd></>)}
            <dt>عميل من</dt><dd className="num">{c.start_date || '—'}</dd>
            <dt>التليفون</dt><dd className="mono">{c.phone || '—'}</dd>
            <dt>إجمالي اللي دفعه</dt><dd className="strong">{money(total)}</dd>
            {c.notes && (<><dt>ملاحظات</dt><dd>{c.notes}</dd></>)}
            <dt>السيرفر</dt>
            <dd>{c.push_error ? <span className="text-danger"><CloudOff size={14} /> {c.push_error}</span>
              : c.pushed_at ? <span className="muted"><CircleCheck size={14} /> متزامن</span> : <span className="muted">لم يُرفع</span>}</dd>
            {c.status === 'suspended' && c.suspend_reason && (<><dt>سبب الإيقاف</dt><dd className="text-danger">{c.suspend_reason}</dd></>)}
          </dl>
        </div>
        <div className="cols-2 equal" style={{ marginTop: 16 }}>
          <div>
            <div className="subhead">المدفوعات <span className="muted small">{payments.length}</span></div>
            {payments.length === 0 ? <Empty>لا توجد مدفوعات</Empty> : (
              <table className="table compact plain">
                <tbody>{payments.map((p) => (
                  <tr key={p.id}><td className="num">{p.date}</td><td>{KIND[p.kind] || ''}{p.months ? ` · ${p.months} شهر` : ''}</td><td className="muted">{p.method}</td><td className="end num strong">{num(p.amount)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div>
            <div className="subhead">المفاتيح الصادرة <span className="muted small">{licenses.length}</span></div>
            {licenses.length === 0 ? <Empty>لم يصدر مفتاح بعد</Empty> : (
              <table className="table compact plain">
                <tbody>{licenses.map((l) => (
                  <tr key={l.id}>
                    <td className="num">{new Date(l.created_at).toISOString().slice(0, 10)}</td>
                    <td>{l.type === 'perpetual' ? 'دائم' : `لحد ${l.expires}`}</td>
                    <td className="end"><button className="icon-btn" title="عرض المفتاح" onClick={() => setKeyResult({ key: l.key })}><KeyRound /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>
      {suspendAsk && (
        <Modal title={`إيقاف ${c.venue || c.name}`} onClose={() => setSuspendAsk(false)} footer={(
          <><span className="spacer" /><button className="btn" onClick={() => setSuspendAsk(false)}>إلغاء</button><button className="btn btn-danger" onClick={() => setSuspended(true)}><Ban />إيقاف</button></>
        )}>
          <p style={{ marginBottom: 12 }}>البرنامج عند العميل هيبقى <b>للعرض فقط</b> أول ما جهازه يتصل بالنت. البيانات بتاعته مش بتتمسح، وتقدر ترجّعه في أي وقت.</p>
          <Field label="السبب (بيظهر للعميل)"><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: متأخرات" /></Field>
        </Modal>
      )}
      {renew && <RenewModal customer={c} onClose={() => setRenew(false)} onDone={(r) => { setRenew(false); setKeyResult(r); }} />}
      {edit && <CustomerForm initial={c} onClose={() => setEdit(false)} />}
      {keyResult && <KeyModal result={keyResult} customer={keyResult.customer || c} onClose={() => setKeyResult(null)} />}
      {confirm && <Confirm title="حذف العميل" confirmText="حذف" message={`حذف ${c.name}؟ المدفوعات المسجلة هتفضل في التقارير.`} onClose={() => setConfirm(false)}
        onConfirm={async () => { await v.remove('customers', c.id); refresh(); onClose(); }} />}
    </>
  );
}

// ------------------------------------------------------------------ list
export default function Customers() {
  const customers = useRows('customers');
  const plans = useRows('plans');
  const payments = useRows('payments');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);

  const lastPay = useMemo(() => {
    const m = {};
    for (const p of payments) if (!m[p.customer_id] || p.date > m[p.customer_id]) m[p.customer_id] = p.date;
    return m;
  }, [payments]);

  const rows = customers
    .map((c) => ({ c, s: statusOf(c) }))
    .filter(({ c, s }) => {
      if (filter === 'attention' && !['expiring', 'grace', 'expired'].includes(s.key)) return false;
      if (filter !== 'all' && filter !== 'attention' && s.key !== filter) return false;
      const t = latin(q.trim());
      return !t || [c.name, c.venue, c.phone, c.city].some((x) => latin(x).includes(t));
    })
    .sort((a, b) => (a.s.days ?? 9999) - (b.s.days ?? 9999));
  const open = customers.find((c) => c.id === openId);

  return (
    <Page title="العملاء" sub={`${customers.length} عميل`} actions={(
      <>
        <div className="search"><Search size={16} /><input placeholder="اسم، مكان، تليفون" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={filter} onChange={setFilter} aria-label="الحالة" options={[
          { value: 'all', label: 'كل العملاء' }, { value: 'attention', label: 'محتاج متابعة' }, { value: 'active', label: 'ساري' }, { value: 'expiring', label: 'ينتهي قريب' },
          { value: 'grace', label: 'فترة سماح' }, { value: 'expired', label: 'منتهي' }, { value: 'perpetual', label: 'شراء نهائي' }, { value: 'new', label: 'لم يُفعّل' }, { value: 'suspended', label: 'موقوف' },
        ]} />
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus />عميل جديد</button>
      </>
    )}>
      <Panel body={false} title="قائمة العملاء" meta={rows.length}>
        {rows.length === 0 ? <Empty icon={Users}>{customers.length ? 'لا يوجد عملاء بالفلتر ده' : 'ضيف أول عميل'}</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>العميل</th><th>المدينة</th><th>الباقة</th><th className="end">السعر</th><th>الحالة</th><th>المتبقي</th><th>آخر دفعة</th></tr></thead>
              <tbody>
                {rows.map(({ c, s }) => (
                  <tr key={c.id} className="clickable" onClick={() => setOpenId(c.id)}>
                    <td><div className="cell-title">{c.name}</div><div className="cell-sub">{c.venue}</div></td>
                    <td className="muted">{c.city || '—'}</td>
                    <td>{plans.find((p) => p.id === c.plan_id)?.name || '—'}</td>
                    <td className="end num">{num(c.price)}<span className="muted small">{c.type === 'subscription' ? ' /شهر' : ''}</span></td>
                    <td><StatusTag c={c} /></td>
                    <td className={`nowrap ${s.tone === 'danger' ? 'text-danger' : s.tone === 'warn' ? 'text-warn' : 'muted'}`}>{remainingLabel(s)}</td>
                    <td className="num muted">{lastPay[c.id] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {adding && <CustomerForm initial={{}} onClose={() => setAdding(false)} />}
      {open && <CustomerDetail customer={open} onClose={() => setOpenId(null)} />}
    </Page>
  );
}

export { daysLeft };
