import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { dateTime, durationLabel, money } from '../lib/format.js';
import schemaSql from '../../supabase/schema.sql?raw';
import { Badge, Confirm, Empty, Field, Modal, MoneyInput, PageHead, Tabs } from '../components/ui.jsx';

const TABS = [
  { id: 'general', label: 'عام والصلاحيات' },
  { id: 'packages', label: 'الباكدجات' },
  { id: 'extras', label: 'الإضافات' },
  { id: 'tickets', label: 'أسعار التذاكر' },
  { id: 'menu', label: 'منيو الكافيه' },
  { id: 'users', label: 'المستخدمين' },
  { id: 'sync', label: 'المزامنة الأونلاين' },
  { id: 'backup', label: 'النسخ الاحتياطي' },
];

const PRICING = { fixed: 'سعر ثابت', hourly: 'بالساعة', custom: 'سعر يدوي لكل حجز' };

export default function Settings() {
  const [tab, setTab] = useState('general');
  return (
    <>
      <PageHead title="الإعدادات" sub="التحكم في الأسعار والصلاحيات والمستخدمين" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'general' && <General />}
      {tab === 'packages' && (
        <Crud tbl="packages" title="باكدجات التصوير" newLabel="باكدج جديدة" defaults={{ pricing_type: 'fixed', price: 0, duration_minutes: 60 }}
          fields={[
            { key: 'name', label: 'الاسم' },
            { key: 'pricing_type', label: 'طريقة التسعير', type: 'select', options: PRICING },
            { key: 'price', label: 'السعر', type: 'money', hint: 'للتسعير بالساعة: سعر الساعة الواحدة' },
            { key: 'duration_minutes', label: 'المدة (دقيقة)', type: 'number', render: (v) => durationLabel(v) },
            { key: 'description', label: 'وصف', table: false },
          ]} />
      )}
      {tab === 'extras' && (
        <Crud tbl="extras" title="إضافات الحجز" newLabel="إضافة جديدة" defaults={{ price: 0 }}
          fields={[{ key: 'name', label: 'الاسم' }, { key: 'price', label: 'السعر', type: 'money' }]} />
      )}
      {tab === 'tickets' && (
        <Crud tbl="ticket_types" title="أنواع وأسعار تذاكر الدخول" newLabel="نوع تذكرة" defaults={{ price: 0 }}
          fields={[{ key: 'name', label: 'النوع' }, { key: 'price', label: 'السعر', type: 'money' }]} />
      )}
      {tab === 'menu' && (
        <Crud tbl="cafe_items" title="منيو الكافيه" newLabel="صنف جديد" defaults={{ price: 0, category: 'مشروبات ساخنة' }}
          fields={[{ key: 'name', label: 'الصنف' }, { key: 'category', label: 'القسم', suggest: true }, { key: 'price', label: 'السعر', type: 'money' }]} />
      )}
      {tab === 'users' && <Users />}
      {tab === 'sync' && <SyncSettings />}
      {tab === 'backup' && <Backup />}
    </>
  );
}

function General() {
  const { settings } = useApp();
  const act = useAction();
  const [f, setF] = useState(null);
  useEffect(() => { if (settings.id && !f) setF(settings); }, [settings, f]);
  if (!f) return null;
  const set = (k, v) => setF({ ...f, [k]: v });
  const listField = (k) => (f[k] || []).join('، ');
  const parseList = (v) => v.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);

  return (
    <div className="card">
      <div className="grid grid-3">
        <Field label="اسم المكان"><input value={f.venueName} onChange={(e) => set('venueName', e.target.value)} /></Field>
        <Field label="العملة"><input value={f.currency} onChange={(e) => set('currency', e.target.value)} /></Field>
        <Field label="أقصى عدد حجوزات في نفس الوقت" hint="يظهر تنبيه عند تجاوزه">
          <input type="number" min="1" value={f.maxConcurrentBookings} onChange={(e) => set('maxConcurrentBookings', Number(e.target.value))} />
        </Field>
      </div>
      <h4 className="section-title">صلاحيات الموظف</h4>
      <div className="toggles">
        <Toggle label="يقدر يعدل سعر الحجز" checked={f.allowEmployeePriceEdit} onChange={(v) => set('allowEmployeePriceEdit', v)} />
        <Toggle label="يقدر يعمل خصم (حجوزات وكافيه)" checked={f.allowEmployeeDiscount} onChange={(v) => set('allowEmployeeDiscount', v)} />
        <Toggle label="يقدر يسجل مصروفات" checked={f.allowEmployeeExpenses} onChange={(v) => set('allowEmployeeExpenses', v)} />
      </div>
      <p className="muted small">الموظف لا يستطيع حذف أي عملية أو تعديل دفعة بعد تسجيلها، ولا يرى تقارير الأرباح.</p>
      <h4 className="section-title">القوائم</h4>
      <div className="grid">
        <Field label="طرق الدفع (افصل بفاصلة)" span={2}><input defaultValue={listField('paymentMethods')} onBlur={(e) => set('paymentMethods', parseList(e.target.value))} /></Field>
        <Field label="بنود المصروفات" span={2}><input defaultValue={listField('expenseCategories')} onBlur={(e) => set('expenseCategories', parseList(e.target.value))} /></Field>
        <Field label="بنود الإيرادات الأخرى" span={2}><input defaultValue={listField('incomeCategories')} onBlur={(e) => set('incomeCategories', parseList(e.target.value))} /></Field>
        <Field label="رسالة أسفل الإيصال" span={2}><input value={f.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} /></Field>
      </div>
      <button className="btn btn-primary" onClick={() => act(() => api.put('settings', { ...f, id: 'app' }), 'تم حفظ الإعدادات').catch(() => {})}>حفظ الإعدادات</button>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span>{label}</span>
    </label>
  );
}

function Crud({ tbl, title, fields, defaults, newLabel }) {
  const { currency } = useApp();
  const act = useAction();
  const [rows] = useData(tbl);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const sorted = [...rows].sort((a, b) => (b.active - a.active) || String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name)));
  const suggestions = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))];

  const save = async () => {
    if (!String(edit.name || '').trim()) return;
    try { await act(() => api.put(tbl, { ...edit, name: edit.name.trim() }), 'تم الحفظ'); setEdit(null); } catch { /* toast */ }
  };

  const show = (f, v) => {
    if (f.render) return f.render(v);
    if (f.type === 'money') return money(v, currency);
    if (f.type === 'select') return f.options[v] || v;
    return v;
  };

  return (
    <div className="card">
      <div className="row-between">
        <h3>{title}</h3>
        <button className="btn btn-primary" onClick={() => setEdit({ active: true, ...defaults })}>+ {newLabel}</button>
      </div>
      {sorted.length === 0 ? <Empty /> : (
        <table className="table">
          <thead><tr>{fields.filter((f) => f.table !== false).map((f) => <th key={f.key}>{f.label}</th>)}<th>الحالة</th><th /></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'inactive'}>
                {fields.filter((f) => f.table !== false).map((f) => <td key={f.key}>{show(f, r[f.key])}</td>)}
                <td>{r.active ? <Badge tone="ok">مفعّل</Badge> : <Badge tone="muted">موقوف</Badge>}</td>
                <td className="actions">
                  <button className="btn btn-sm" onClick={() => setEdit(r)}>تعديل</button>
                  <button className="btn btn-sm" onClick={() => act(() => api.put(tbl, { ...r, active: !r.active }), r.active ? 'تم الإيقاف' : 'تم التفعيل').catch(() => {})}>{r.active ? 'إيقاف' : 'تفعيل'}</button>
                  <button className="icon-btn" title="حذف" onClick={() => setConfirm(r)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && (
        <Modal title={edit.id ? `تعديل: ${edit.name}` : newLabel} onClose={() => setEdit(null)} footer={(
          <>
            <button className="btn" onClick={() => setEdit(null)}>إلغاء</button>
            <button className="btn btn-primary" onClick={save} disabled={!String(edit.name || '').trim()}>حفظ</button>
          </>
        )}>
          <div className="grid">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                {f.type === 'money' ? <MoneyInput value={edit[f.key]} onChange={(v) => setEdit({ ...edit, [f.key]: v })} />
                  : f.type === 'number' ? <input type="number" min="0" value={edit[f.key] ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: Number(e.target.value) })} />
                    : f.type === 'select' ? (
                      <select value={edit[f.key]} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })}>
                        {Object.entries(f.options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : (
                      <>
                        <input autoFocus={f.key === 'name'} list={f.suggest ? `sug-${f.key}` : undefined} value={edit[f.key] || ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                        {f.suggest && <datalist id={`sug-${f.key}`}>{suggestions(f.key).map((s) => <option key={s} value={s} />)}</datalist>}
                      </>
                    )}
              </Field>
            ))}
            <label className="check"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> مفعّل</label>
          </div>
        </Modal>
      )}
      {confirm && <Confirm message={`حذف "${confirm.name}"؟ (الحجوزات والفواتير القديمة لن تتأثر)`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove(tbl, confirm.id), 'تم الحذف')} />}
    </div>
  );
}

function Users() {
  const { user: me } = useApp();
  const act = useAction();
  const [users] = useData('users');
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const save = async () => {
    try { await act(() => api.saveUser(edit), 'تم حفظ المستخدم'); setEdit(null); } catch { /* toast */ }
  };

  return (
    <div className="card">
      <div className="row-between">
        <h3>المستخدمين</h3>
        <button className="btn btn-primary" onClick={() => setEdit({ role: 'employee', active: true, name: '', username: '', password: '' })}>+ مستخدم جديد</button>
      </div>
      <table className="table">
        <thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الصلاحية</th><th>التليفون</th><th>الحالة</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'inactive'}>
              <td>{u.name}{u.id === me.id && <span className="muted small"> (أنت)</span>}</td>
              <td className="mono">{u.username}</td>
              <td>{u.role === 'admin' ? <Badge tone="info">مدير</Badge> : <Badge tone="muted">موظف</Badge>}</td>
              <td className="mono">{u.phone}</td>
              <td>{u.active ? <Badge tone="ok">نشط</Badge> : <Badge tone="danger">موقوف</Badge>}</td>
              <td className="actions">
                <button className="btn btn-sm" onClick={() => setEdit({ ...u, password: '' })}>تعديل</button>
                {u.id !== me.id && <button className="icon-btn" title="حذف" onClick={() => setConfirm(u)}>🗑</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal title={edit.id ? `تعديل ${edit.name}` : 'مستخدم جديد'} onClose={() => setEdit(null)} footer={(
          <>
            <button className="btn" onClick={() => setEdit(null)}>إلغاء</button>
            <button className="btn btn-primary" onClick={save}>حفظ</button>
          </>
        )}>
          <div className="grid">
            <Field label="الاسم"><input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="اسم الدخول"><input dir="ltr" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
            <Field label={edit.id ? 'كلمة مرور جديدة (اتركها فارغة بدون تغيير)' : 'كلمة المرور'}>
              <input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
            <Field label="الصلاحية">
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                <option value="employee">موظف</option>
                <option value="admin">مدير</option>
              </select>
            </Field>
            <Field label="التليفون"><input dir="ltr" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> الحساب نشط</label>
          </div>
        </Modal>
      )}
      {confirm && <Confirm message={`حذف المستخدم ${confirm.name}؟ عملياته السابقة ستظل محفوظة.`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('users', confirm.id), 'تم الحذف')} />}
    </div>
  );
}

function SyncSettings() {
  const { syncStatus, setSyncStatus, toast } = useApp();
  const [cfg, setCfg] = useState(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.syncConfig().then(setCfg).catch((e) => toast(e.message, 'error')); }, [toast]);
  if (!cfg) return null;

  const save = async () => {
    setBusy(true);
    try {
      const c = await api.setSyncConfig({ ...cfg, password });
      setCfg(c); setPassword('');
      toast(c.enabled ? 'تم حفظ إعدادات المزامنة — جاري الاتصال' : 'تم إيقاف المزامنة');
      setTimeout(() => api.syncStatus().then(setSyncStatus), 2500);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const s = syncStatus || {};
  return (
    <div className="two-col">
      <div className="card">
        <h3>ربط الأجهزة ببعض (Supabase)</h3>
        <label className="toggle">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span>تفعيل المزامنة الأونلاين</span>
        </label>
        <div className="grid">
          <Field label="Project URL" span={2}><input dir="ltr" placeholder="https://xxxx.supabase.co" value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} /></Field>
          <Field label="anon public key" span={2}><input dir="ltr" value={cfg.anonKey} onChange={(e) => setCfg({ ...cfg, anonKey: e.target.value })} /></Field>
          <Field label="إيميل حساب المزامنة"><input dir="ltr" value={cfg.email} onChange={(e) => setCfg({ ...cfg, email: e.target.value })} /></Field>
          <Field label="كلمة مرور حساب المزامنة" hint={cfg.hasPassword ? 'محفوظة — اكتب جديدة لتغييرها' : ''}>
            <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={save} disabled={busy}>حفظ واتصال</button>
          <button className="btn" onClick={() => api.syncNow().then(setSyncStatus)} disabled={!cfg.enabled}>مزامنة الآن</button>
        </div>
        <dl className="dl">
          <dt>الحالة</dt><dd>{{ off: 'غير مفعّلة', idle: 'متصل ومتزامن', syncing: 'جاري المزامنة', offline: 'لا يوجد إنترنت — سيتم المزامنة تلقائياً عند الاتصال', error: 'خطأ' }[s.state] || '-'}</dd>
          <dt>آخر مزامنة</dt><dd>{s.lastSync ? dateTime(s.lastSync) : '—'}</dd>
          <dt>في الانتظار</dt><dd>{s.pending ?? 0} عملية</dd>
          {s.error && (<><dt>الخطأ</dt><dd className="text-danger">{s.error}</dd></>)}
        </dl>
      </div>
      <div className="card help">
        <h3>طريقة الإعداد (مرة واحدة)</h3>
        <ol>
          <li>اعمل حساب مجاني على <b>supabase.com</b> واعمل مشروع جديد.</li>
          <li>من <b>SQL Editor</b> الصق كود الإعداد واضغط Run.{' '}
            <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(schemaSql).then(() => toast('تم نسخ كود SQL'))}>نسخ كود SQL</button>
          </li>
          <li>من <b>Authentication ← Users</b> اضغط Add user واعمل إيميل وكلمة مرور خاصين بالمكان (فعّل Auto Confirm).</li>
          <li>من <b>Project Settings ← API</b> انسخ Project URL و anon public key.</li>
          <li>اكتب البيانات هنا على <b>كل جهاز</b> بنفس الإيميل وكلمة المرور.</li>
        </ol>
        <p className="muted small">البرنامج يشتغل عادي من غير نت، وأول ما النت يرجع بيرفع ويستقبل التعديلات تلقائياً كل 20 ثانية.</p>
      </div>
    </div>
  );
}

function Backup() {
  const act = useAction();
  const [info, setInfo] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api.appInfo().then(setInfo).catch(() => {}); }, []);
  return (
    <div className="card narrow">
      <h3>النسخ الاحتياطي</h3>
      <p className="muted">احفظ نسخة من كل البيانات في ملف على فلاشة أو جوجل درايف — مفيدة حتى لو المزامنة شغالة.</p>
      <div className="row">
        <button className="btn btn-primary" onClick={() => act(() => api.exportBackup(), 'تم حفظ النسخة الاحتياطية').catch(() => {})}>حفظ نسخة احتياطية</button>
        <button className="btn" onClick={() => setConfirm(true)}>استرجاع من ملف</button>
      </div>
      {info && <p className="muted small">إصدار البرنامج {info.version} — مكان البيانات: <span className="mono" dir="ltr">{info.dataPath}</span></p>}
      {confirm && (
        <Confirm title="استرجاع نسخة احتياطية" danger={false} confirmText="اختيار الملف"
          message="سيتم دمج بيانات الملف مع البيانات الحالية (السجلات الأحدث تبقى). متابعة؟"
          onClose={() => setConfirm(false)}
          onConfirm={() => act(async () => { const n = await api.importBackup(); return n; }, 'تم الاسترجاع')} />
      )}
    </div>
  );
}
