import { useEffect, useState } from 'react';
import { CircleCheck, Cloud, Copy, Download, FileSpreadsheet, Link2, Pencil, Plus, RefreshCw, TriangleAlert, Upload, Wallet } from 'lucide-react';
import serverSql from '../../../supabase/license-server.sql?raw';
import { brand } from '../../lib/brand.js';
import { v } from '../vapi.js';
import { useRows, useV } from '../state.jsx';
import { money, num, startOfMonth, today, toCSV } from '../../lib/format.js';
import Select from '../../components/Select.jsx';
import { Confirm, Empty, Field, Metric, Metrics, Modal, MoneyInput, Notice, Page, Panel } from '../../components/ui.jsx';
import { RangePicker } from '../../pages/Finance.jsx';

const KIND = { subscription: 'اشتراك', purchase: 'شراء نهائي', support: 'تجديد دعم' };

// ------------------------------------------------------------------ payments
export function Payments() {
  const { toast } = useV();
  const payments = useRows('payments');
  const customers = useRows('customers');
  const [range, setRange] = useState({ from: startOfMonth(), to: today() });
  const name = (id) => customers.find((c) => c.id === id)?.name || '—';
  const rows = payments.filter((p) => p.date >= range.from && p.date <= range.to).sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const by = (k) => rows.filter((p) => p.kind === k).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const exportCsv = async () => {
    const csv = toCSV(['التاريخ', 'العميل', 'النوع', 'المدة', 'المبلغ', 'طريقة الدفع'], rows.map((p) => [p.date, name(p.customer_id), KIND[p.kind] || '', p.months || '', p.amount, p.method]));
    try { const f = await v.saveFile({ defaultPath: `payments-${range.from}_${range.to}.csv`, content: csv, filters: [{ name: 'CSV', extensions: ['csv'] }] }); if (f) toast('تم الحفظ'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Page title="المدفوعات" actions={<button className="btn" onClick={exportCsv}><FileSpreadsheet />تصدير Excel</button>}>
      <RangePicker value={range} onChange={setRange} />
      <Metrics>
        <Metric label="الإجمالي" amount={total} currency="ج.م" sub={`${rows.length} دفعة`} />
        <Metric label="اشتراكات" amount={by('subscription')} currency="ج.م" />
        <Metric label="بيع نهائي" amount={by('purchase')} currency="ج.م" />
        <Metric label="تجديد دعم" amount={by('support')} currency="ج.م" />
      </Metrics>
      <Panel body={false} title="الدفعات" meta={rows.length}>
        {rows.length === 0 ? <Empty icon={Wallet}>لا توجد دفعات في الفترة دي</Empty> : (
          <table className="table">
            <thead><tr><th>التاريخ</th><th>العميل</th><th>النوع</th><th>الفترة</th><th>الدفع</th><th className="end">المبلغ</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td className="num">{p.date}</td><td className="cell-title">{name(p.customer_id)}</td><td>{KIND[p.kind] || ''}{p.months ? ` · ${p.months} شهر` : ''}</td>
                <td className="num muted small">{p.period || '—'}</td><td className="muted">{p.method}</td><td className="end num strong">{num(p.amount)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
    </Page>
  );
}

// ------------------------------------------------------------------ plans
export function Plans() {
  const { toast, refresh } = useV();
  const plans = useRows('plans');
  const customers = useRows('customers');
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const save = async () => {
    if (!String(edit.name || '').trim()) return;
    try { await v.put('plans', { ...edit, price: Number(edit.price) || 0 }); refresh(); setEdit(null); toast('تم الحفظ'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Page title="الباقات والأسعار" actions={<button className="btn btn-primary" onClick={() => setEdit({ name: '', type: 'subscription', price: 1000, active: true, description: '' })}><Plus />باقة</button>}>
      <Panel body={false} title="الباقات" meta={plans.length}>
        <table className="table">
          <thead><tr><th>الباقة</th><th>النوع</th><th className="end">السعر</th><th>العملاء</th><th>الحالة</th><th /></tr></thead>
          <tbody>{plans.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'inactive'}>
              <td><div className="cell-title">{p.name}</div><div className="cell-sub">{p.description}</div></td>
              <td>{p.type === 'perpetual' ? `شراء نهائي${p.support_months ? ` + ${p.support_months} شهر دعم` : ''}` : 'اشتراك شهري'}</td>
              <td className="end num strong">{num(p.price)}<span className="muted small">{p.type === 'subscription' ? ' /شهر' : ''}</span></td>
              <td className="num">{customers.filter((c) => c.plan_id === p.id).length}</td>
              <td><span className={`status ${p.active ? 'status-ok' : 'status-muted'}`}>{p.active ? 'متاحة' : 'موقوفة'}</span></td>
              <td className="actions"><div><button className="icon-btn" title="تعديل" onClick={() => setEdit(p)}><Pencil /></button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
      {edit && (
        <Modal title={edit.id ? edit.name : 'باقة جديدة'} onClose={() => setEdit(null)} footer={(
          <><label className="check"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />متاحة</label>
            {edit.id && <button className="btn btn-danger-quiet" onClick={() => setConfirm(edit)}>حذف</button>}
            <span className="spacer" /><button className="btn" onClick={() => setEdit(null)}>إلغاء</button><button className="btn btn-primary" onClick={save}>حفظ</button></>
        )}>
          <div className="form-grid">
            <Field label="اسم الباقة"><input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="النوع"><Select value={edit.type} onChange={(t) => setEdit({ ...edit, type: t })} options={[{ value: 'subscription', label: 'اشتراك شهري' }, { value: 'perpetual', label: 'شراء نهائي' }]} /></Field>
            <Field label={edit.type === 'subscription' ? 'السعر في الشهر' : 'سعر الشراء'}><MoneyInput value={edit.price} onChange={(x) => setEdit({ ...edit, price: x })} /></Field>
            {edit.type === 'perpetual' && <Field label="شهور الدعم المجاني"><input type="number" min="0" value={edit.support_months ?? 12} onChange={(e) => setEdit({ ...edit, support_months: Number(e.target.value) })} /></Field>}
            <Field label="وصف" span={2}><input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {confirm && <Confirm title="حذف الباقة" confirmText="حذف" message={`حذف باقة ${confirm.name}؟ العملاء عليها مش هيتأثروا.`} onClose={() => setConfirm(null)}
        onConfirm={async () => { await v.remove('plans', confirm.id); refresh(); setEdit(null); }} />}
    </Page>
  );
}

// ------------------------------------------------------------------ settings
export function VendorSettings() {
  const { toast, refresh } = useV();
  const settings = useRows('settings');
  const [key, setKey] = useState(null);
  const [info, setInfo] = useState(null);
  const [tpl, setTpl] = useState(null);
  const load = () => { v.keyInfo().then(setKey).catch(() => {}); v.info().then(setInfo).catch(() => {}); };
  useEffect(load, []);
  const stored = settings.find((s) => s.id === 'vendor');
  useEffect(() => { if (tpl === null && settings.length >= 0) setTpl(stored?.waTemplate ?? null); }, [stored]); // eslint-disable-line
  const [srv, setSrv] = useState(null);
  const [srvPass, setSrvPass] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { v.server().then(setSrv).catch(() => {}); }, []);
  const saveServer = async () => {
    setBusy(true);
    try { await v.setServer({ ...srv, password: srvPass }); setSrvPass(''); setSrv(await v.server()); load(); toast('تم الاتصال بسيرفر التراخيص'); } catch (e) { toast(`تعذّر الاتصال: ${e.message}`, 'error'); }
    setBusy(false);
  };
  const pushAll = async () => {
    setBusy(true);
    try { const r = await v.pushAll(); refresh(); toast(r.fail ? `اترفع ${r.ok} وفشل ${r.fail}: ${r.error}` : `اترفع ${r.ok} عميل`, r.fail ? 'error' : 'success'); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const defaultTpl = `أهلاً {name} 👋\nده مفتاح تفعيل ${brand.nameAr || brand.productName} لـ {venue}{until}:\n\n{key}\n\nمن البرنامج: الإعدادات ← الترخيص ← الصق المفتاح ← تفعيل.`;

  return (
    <Page title="الإعدادات">
      <Panel title="مفتاح التوقيع">
        {key && (key.linked && key.serverLinked
          ? <Notice tone="info" icon={CircleCheck}>البرنامج مربوط بمفتاح الجهاز ده{key.server ? ' وبسيرفر التراخيص' : ''} — أي ترخيص تطلعه من هنا هيشتغل على نسخ العملاء.</Notice>
          : key.linked && !key.serverLinked
          ? <Notice tone="warn" icon={TriangleAlert}>
            إعدادات سيرفر التراخيص اتغيرت — اربط البرنامج تاني واعمل build جديد عشان نسخ العملاء تعرف السيرفر.
            <span className="spacer" />
            {key.canLink && <button className="link" onClick={() => v.link().then(() => { toast('تم الربط — اعمل build جديد للبرنامج'); load(); }).catch((e) => toast(e.message, 'error'))}><Link2 size={14} /> اربط تاني</button>}
          </Notice>
          : <Notice tone="warn" icon={TriangleAlert}>
            {key.builtIn ? 'البرنامج مربوط بمفتاح تاني — المفاتيح اللي تطلعها من هنا مش هتشتغل.' : 'البرنامج لسه مش مربوط بمفتاح — نظام الترخيص مقفول في نسخ العملاء.'}
            <span className="spacer" />
            {key.canLink && <button className="link" onClick={() => v.link().then(() => { toast('تم الربط — اعمل build جديد للبرنامج'); load(); }).catch((e) => toast(e.message, 'error'))}><Link2 size={14} /> اربط البرنامج بالمفتاح ده</button>}
          </Notice>)}
        <p className="muted small" style={{ marginTop: 12 }}>
          المفتاح السري محفوظ على الجهاز ده بس. لو ضاع، المفاتيح الجديدة مش هتشتغل مع النسخ القديمة —
          <b> خد نسخة احتياطية واحفظها في مكان آمن</b> (فلاشة أو Google Drive).
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => v.exportBackup().then((p) => p && toast('تم حفظ النسخة الاحتياطية')).catch((e) => toast(e.message, 'error'))}><Download />نسخة احتياطية (العملاء + المفتاح)</button>
          <button className="btn" onClick={() => v.importBackup().then((n) => { if (n !== null) { toast(`تم الاسترجاع (${n} سجل)`); refresh(); load(); } }).catch((e) => toast(e.message, 'error'))}><Upload />استرجاع</button>
        </div>
        {info && <p className="muted small mono" style={{ marginTop: 12, textAlign: 'right' }}>{info.dataPath}</p>}
      </Panel>
      <Panel title="سيرفر التراخيص" meta="لإيقاف وتجديد العملاء أونلاين"
        actions={<button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(serverSql).then(() => toast('تم نسخ كود SQL'))}><Copy />نسخ كود الإعداد</button>}>
        {srv && (
          <>
            <ol className="help" style={{ marginBottom: 12 }}>
              <li>اعمل مشروع Supabase مجاني <b>باسمك انت</b> (مش بتاع عميل).</li>
              <li>SQL Editor ← الصق كود الإعداد ← Run.</li>
              <li>Authentication ← اقفل "Allow new users to sign up"، وضيف يوزر ليك انت بس.</li>
              <li>اكتب البيانات هنا واضغط حفظ، وبعدين "اربط البرنامج" تحت.</li>
            </ol>
            <div className="form-grid">
              <Field label="Project URL" span={2}><input dir="ltr" placeholder="https://xxxx.supabase.co" value={srv.url} onChange={(e) => setSrv({ ...srv, url: e.target.value })} /></Field>
              <Field label="anon public key" span={2}><input dir="ltr" value={srv.anonKey} onChange={(e) => setSrv({ ...srv, anonKey: e.target.value })} /></Field>
              <Field label="إيميلك"><input dir="ltr" value={srv.email} onChange={(e) => setSrv({ ...srv, email: e.target.value })} /></Field>
              <Field label="كلمة المرور" hint={srv.hasPassword ? 'محفوظة' : null}><input type="password" dir="ltr" value={srvPass} onChange={(e) => setSrvPass(e.target.value)} /></Field>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" disabled={busy} onClick={saveServer}><Cloud />حفظ واختبار الاتصال</button>
              <button className="btn" disabled={busy || !srv.url} onClick={pushAll}><RefreshCw />رفع كل العملاء</button>
            </div>
          </>
        )}
      </Panel>
      <Panel title="رسالة الواتساب" meta="{name} {venue} {until} {key}">
        <textarea rows={6} value={tpl ?? defaultTpl} onChange={(e) => setTpl(e.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => v.put('settings', { ...(stored || {}), id: 'vendor', waTemplate: tpl ?? defaultTpl }).then(() => { refresh(); toast('تم الحفظ'); })}>حفظ</button>
          <button className="btn btn-quiet" onClick={() => setTpl(defaultTpl)}>الرسالة الافتراضية</button>
        </div>
      </Panel>
    </Page>
  );
}

export { money };
