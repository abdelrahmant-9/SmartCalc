import { useEffect, useState } from 'react';
import { Copy, Download, Pencil, Plus, Printer, RefreshCw, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { dateTime, durationLabel, latin, num } from '../lib/format.js';
import schemaSql from '../../supabase/schema.sql?raw';
import { printReceipt } from '../lib/print.js';
import Combobox from '../components/Combobox.jsx';
import Select from '../components/Select.jsx';
import { Confirm, Empty, Field, Modal, MoneyInput, Page, Panel, Switch, Tabs } from '../components/ui.jsx';

const TABS = [
  { id: 'general', label: 'عام' },
  { id: 'packages', label: 'الباكدجات' },
  { id: 'extras', label: 'الإضافات' },
  { id: 'tickets', label: 'التذاكر' },
  { id: 'menu', label: 'المنيو' },
  { id: 'users', label: 'المستخدمين' },
  { id: 'sync', label: 'المزامنة' },
  { id: 'backup', label: 'النسخ الاحتياطي' },
];

const PRICING = { fixed: 'سعر ثابت', hourly: 'بالساعة', custom: 'يحدد لكل حجز' };

export default function Settings() {
  const [tab, setTab] = useState('general');
  return (
    <Page title="الإعدادات" tabs={<Tabs tabs={TABS} value={tab} onChange={setTab} />}>
      {tab === 'general' && <General />}
      {tab === 'packages' && (
        <Crud tbl="packages" title="باكدجات التصوير" newLabel="باكدج" defaults={{ pricing_type: 'fixed', price: 0, duration_minutes: 60 }}
          fields={[
            { key: 'name', label: 'الاسم' },
            { key: 'pricing_type', label: 'التسعير', type: 'select', options: PRICING },
            { key: 'price', label: 'السعر', type: 'money', hint: 'في التسعير بالساعة: سعر الساعة' },
            { key: 'duration_minutes', label: 'المدة (دقيقة)', type: 'number', render: (v) => durationLabel(v) },
            { key: 'description', label: 'وصف', table: false },
          ]} />
      )}
      {tab === 'extras' && (
        <Crud tbl="extras" title="إضافات الحجز" newLabel="إضافة" defaults={{ price: 0 }}
          fields={[{ key: 'name', label: 'الاسم' }, { key: 'price', label: 'السعر', type: 'money' }]} />
      )}
      {tab === 'tickets' && (
        <Crud tbl="ticket_types" title="أنواع التذاكر وأسعارها" newLabel="نوع تذكرة" defaults={{ price: 0 }}
          fields={[{ key: 'name', label: 'النوع' }, { key: 'price', label: 'السعر', type: 'money' }]} />
      )}
      {tab === 'menu' && (
        <Crud tbl="cafe_items" title="منيو الكافيه" newLabel="صنف" defaults={{ price: 0, category: 'مشروبات ساخنة' }}
          fields={[{ key: 'name', label: 'الصنف' }, { key: 'category', label: 'القسم', suggest: true }, { key: 'price', label: 'السعر', type: 'money' }]} />
      )}
      {tab === 'users' && <Users />}
      {tab === 'sync' && <SyncSettings />}
      {tab === 'backup' && <Backup />}
    </Page>
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
  const save = () => act(() => api.put('settings', { ...f, id: 'app' }), 'تم حفظ الإعدادات').catch(() => {});

  return (
    <>
      <div className="cols-2">
        <Panel title="بيانات المكان">
          <div className="form-grid">
            <Field label="اسم المكان"><input value={f.venueName} onChange={(e) => set('venueName', e.target.value)} /></Field>
            <Field label="العملة"><input value={f.currency} onChange={(e) => set('currency', e.target.value)} /></Field>
            <Field label="أقصى عدد حجوزات في نفس التوقيت" hint="يظهر تنبيه عند تجاوزه">
              <input type="number" min="1" value={f.maxConcurrentBookings} onChange={(e) => set('maxConcurrentBookings', Number(e.target.value))} />
            </Field>
          </div>
        </Panel>
        <Panel title="صلاحيات الموظف">
          <Switch label="تعديل سعر الحجز" desc="كتابة سعر نهائي مختلف عن سعر الباكدج" checked={f.allowEmployeePriceEdit} onChange={(v) => set('allowEmployeePriceEdit', v)} />
          <Switch label="عمل خصم" desc="في الحجوزات وطلبات الكافيه" checked={f.allowEmployeeDiscount} onChange={(v) => set('allowEmployeeDiscount', v)} />
          <Switch label="تسجيل مصروفات" desc="المصروفات تظهر باسم الموظف في الحسابات" checked={f.allowEmployeeExpenses} onChange={(v) => set('allowEmployeeExpenses', v)} />
        </Panel>
      </div>
      <Panel title="الإيصال" actions={<button className="btn btn-sm" onClick={() => printReceipt({
        settings: f, title: 'فاتورة كافيه', number: '12', meta: [['التاريخ', '2026-11-23'], ['الوقت', '6:30 م'], ['الكاشير', 'تجربة']],
        items: [{ name: 'قهوة تركي', qty: 2, price: 40 }, { name: 'ليمون نعناع', qty: 1, price: 50 }], grand: ['الإجمالي', 130], payment: 'كاش',
      })}><Printer />طباعة تجريبية</button>}>
        <div className="form-grid">
          <Field label="مقاس الورق">
            <Select value={f.receiptPaper || '80mm'} onChange={(v) => set('receiptPaper', v)} options={[
              { value: '80mm', label: 'طابعة فواتير 80mm' }, { value: '58mm', label: 'طابعة فواتير 58mm' }, { value: 'A4', label: 'ورق A4' },
            ]} />
          </Field>
          <Field label="تليفون المكان"><input dir="ltr" value={f.venuePhone || ''} onChange={(e) => set('venuePhone', latin(e.target.value))} /></Field>
          <Field label="العنوان"><input value={f.venueAddress || ''} onChange={(e) => set('venueAddress', e.target.value)} /></Field>
          <Field label="رسالة آخر الإيصال"><input value={f.receiptFooter || ''} onChange={(e) => set('receiptFooter', e.target.value)} /></Field>
        </div>
      </Panel>
      <Panel title="القوائم" meta="افصل بين العناصر بفاصلة">
        <div className="form-grid">
          <Field label="طرق الدفع" span={2}><input defaultValue={listField('paymentMethods')} onBlur={(e) => set('paymentMethods', parseList(e.target.value))} /></Field>
          <Field label="بنود المصروفات" span={2}><input defaultValue={listField('expenseCategories')} onBlur={(e) => set('expenseCategories', parseList(e.target.value))} /></Field>
          <Field label="بنود الإيرادات الأخرى" span={2}><input defaultValue={listField('incomeCategories')} onBlur={(e) => set('incomeCategories', parseList(e.target.value))} /></Field>
        </div>
      </Panel>
      <div className="row"><button className="btn btn-primary" onClick={save}>حفظ التغييرات</button></div>
    </>
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
  const cols = fields.filter((f) => f.table !== false);

  const save = async () => {
    if (!String(edit.name || '').trim()) return;
    try { await act(() => api.put(tbl, { ...edit, name: edit.name.trim() }), 'تم الحفظ'); setEdit(null); } catch { /* toast */ }
  };

  const show = (f, v) => {
    if (f.render) return f.render(v);
    if (f.type === 'money') return <span className="num strong">{num(v)} <span className="muted small">{currency}</span></span>;
    if (f.type === 'select') return f.options[v] || v;
    return v;
  };

  return (
    <Panel body={false} title={title} meta={rows.length || null}
      actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ active: true, ...defaults })}><Plus />{newLabel}</button>}>
      {sorted.length === 0 ? <Empty /> : (
        <table className="table">
          <thead><tr>{cols.map((f) => <th key={f.key}>{f.label}</th>)}<th>الحالة</th><th /></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'inactive'}>
                {cols.map((f, i) => <td key={f.key} className={i === 0 ? 'cell-title' : ''}>{show(f, r[f.key])}</td>)}
                <td>
                  <button className="btn btn-sm btn-quiet" title={r.active ? 'إيقاف' : 'تفعيل'}
                    onClick={() => act(() => api.put(tbl, { ...r, active: !r.active }), r.active ? 'تم الإيقاف' : 'تم التفعيل').catch(() => {})}>
                    <span className={`status ${r.active ? 'status-ok' : 'status-muted'}`}>{r.active ? 'مفعّل' : 'موقوف'}</span>
                  </button>
                </td>
                <td className="actions">
                  <div>
                    <button className="icon-btn" title="تعديل" onClick={() => setEdit(r)}><Pencil /></button>
                    <button className="icon-btn danger" title="حذف" onClick={() => setConfirm(r)}><Trash2 /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && (
        <Modal title={edit.id ? edit.name : `${newLabel} جديد`} onClose={() => setEdit(null)} footer={(
          <>
            <label className="check"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />مفعّل</label>
            <span className="spacer" />
            <button className="btn" onClick={() => setEdit(null)}>إلغاء</button>
            <button className="btn btn-primary" onClick={save} disabled={!String(edit.name || '').trim()}>حفظ</button>
          </>
        )}>
          <div className="form-grid">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} span={f.key === 'description' ? 2 : undefined}>
                {f.type === 'money' ? <MoneyInput value={edit[f.key]} onChange={(v) => setEdit({ ...edit, [f.key]: v })} />
                  : f.type === 'number' ? <input type="number" min="0" value={edit[f.key] ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: Number(e.target.value) })} />
                    : f.type === 'select' ? (
                      <Select value={edit[f.key]} onChange={(v) => setEdit({ ...edit, [f.key]: v })} options={Object.entries(f.options).map(([value, label]) => ({ value, label }))} />
                    ) : (
                      f.suggest
                        ? <Combobox value={edit[f.key] || ''} onChange={(v) => setEdit({ ...edit, [f.key]: v })} options={suggestions(f.key)} newLabel="قسم جديد" />
                        : <input autoFocus={f.key === 'name'} value={edit[f.key] || ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                    )}
              </Field>
            ))}
          </div>
        </Modal>
      )}
      {confirm && <Confirm title="حذف" confirmText="حذف" message={`حذف "${confirm.name}"؟ الحجوزات والفواتير السابقة لن تتأثر.`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove(tbl, confirm.id), 'تم الحذف')} />}
    </Panel>
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
    <Panel body={false} title="المستخدمين" meta={users.length}
      actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ role: 'employee', active: true, name: '', username: '', password: '' })}><Plus />مستخدم</button>}>
      <table className="table">
        <thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الصلاحية</th><th>التليفون</th><th>الحالة</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'inactive'}>
              <td>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <div className="avatar">{(u.name || '?').trim().slice(0, 1)}</div>
                  <span className="cell-title">{u.name}</span>{u.id === me.id && <span className="tag">أنت</span>}
                </div>
              </td>
              <td className="mono">{u.username}</td>
              <td>{u.role === 'admin' ? <span className="tag tag-brand">مدير</span> : <span className="tag">موظف</span>}</td>
              <td className="mono muted">{latin(u.phone) || '—'}</td>
              <td><span className={`status ${u.active ? 'status-ok' : 'status-muted'}`}>{u.active ? 'نشط' : 'موقوف'}</span></td>
              <td className="actions">
                <div>
                  <button className="icon-btn" title="تعديل" onClick={() => setEdit({ ...u, password: '' })}><Pencil /></button>
                  {u.id !== me.id && <button className="icon-btn danger" title="حذف" onClick={() => setConfirm(u)}><Trash2 /></button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal title={edit.id ? edit.name : 'مستخدم جديد'} onClose={() => setEdit(null)} footer={(
          <>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />الحساب نشط</label>
            <span className="spacer" />
            <button className="btn" onClick={() => setEdit(null)}>إلغاء</button>
            <button className="btn btn-primary" onClick={save}>حفظ</button>
          </>
        )}>
          <div className="form-grid">
            <Field label="الاسم"><input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="اسم الدخول"><input dir="ltr" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
            <Field label="كلمة المرور" hint={edit.id ? 'اتركها فارغة للإبقاء على الحالية' : null}>
              <input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
            <Field label="الصلاحية">
              <Select value={edit.role} onChange={(v) => setEdit({ ...edit, role: v })} options={[{ value: 'employee', label: 'موظف' }, { value: 'admin', label: 'مدير' }]} />
            </Field>
            <Field label="التليفون"><input dir="ltr" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: latin(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
      {confirm && <Confirm title="حذف مستخدم" confirmText="حذف" message={`حذف ${confirm.name}؟ عملياته السابقة تظل محفوظة.`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('users', confirm.id), 'تم الحذف')} />}
    </Panel>
  );
}

const SYNC_STATE = { off: 'غير مفعّلة', idle: 'متصل', syncing: 'جاري المزامنة', offline: 'بدون إنترنت — ستكمل تلقائياً', error: 'خطأ' };

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
      toast(c.enabled ? 'تم الحفظ — جاري الاتصال' : 'تم إيقاف المزامنة');
      setTimeout(() => api.syncStatus().then(setSyncStatus), 2500);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const s = syncStatus || {};
  return (
    <div className="cols-2">
      <Panel title="ربط الأجهزة"
        actions={<button className="btn btn-sm" onClick={() => api.syncNow().then(setSyncStatus)} disabled={!cfg.enabled}><RefreshCw />مزامنة الآن</button>}>
        <Switch label="المزامنة الأونلاين" desc="كل الأجهزة المربوطة بنفس الحساب تشوف نفس البيانات" checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} />
        <div className="form-grid" style={{ marginTop: 16 }}>
          <Field label="Project URL" span={2}><input dir="ltr" placeholder="https://xxxx.supabase.co" value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} /></Field>
          <Field label="Anon public key" span={2}><input dir="ltr" value={cfg.anonKey} onChange={(e) => setCfg({ ...cfg, anonKey: e.target.value })} /></Field>
          <Field label="إيميل الحساب"><input dir="ltr" value={cfg.email} onChange={(e) => setCfg({ ...cfg, email: e.target.value })} /></Field>
          <Field label="كلمة المرور" hint={cfg.hasPassword ? 'محفوظة' : null}>
            <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={busy}>حفظ واتصال</button>
        </div>
        <dl className="facts" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <dt>الحالة</dt><dd>{SYNC_STATE[s.state] || '—'}</dd>
          <dt>آخر مزامنة</dt><dd className="num">{s.lastSync ? dateTime(s.lastSync) : '—'}</dd>
          <dt>في الانتظار</dt><dd className="num">{s.pending ?? 0}</dd>
          {s.error && (<><dt>الخطأ</dt><dd className="text-danger">{s.error}</dd></>)}
        </dl>
      </Panel>
      <Panel title="الإعداد لأول مرة">
        <ol className="help">
          <li>إنشاء حساب ومشروع مجاني على supabase.com</li>
          <li>
            من SQL Editor: لصق كود الإعداد ثم Run{' '}
            <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(schemaSql).then(() => toast('تم نسخ الكود'))}><Copy />نسخ الكود</button>
          </li>
          <li>من Authentication ← Users: إضافة مستخدم للمكان مع تفعيل Auto Confirm</li>
          <li>من Project Settings ← API: نسخ Project URL و anon key</li>
          <li>إدخال نفس البيانات على كل جهاز</li>
        </ol>
      </Panel>
    </div>
  );
}

function Backup() {
  const act = useAction();
  const [info, setInfo] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api.appInfo().then(setInfo).catch(() => {}); }, []);
  return (
    <Panel title="النسخ الاحتياطي" className="narrow">
      <p className="muted">ملف واحد فيه كل البيانات. يُفضل حفظ نسخة أسبوعياً على فلاشة أو Google Drive.</p>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => act(() => api.exportBackup(), 'تم حفظ النسخة').catch(() => {})}><Download />حفظ نسخة</button>
        <button className="btn" onClick={() => setConfirm(true)}><Upload />استرجاع من ملف</button>
      </div>
      {info && (
        <dl className="facts" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <dt>الإصدار</dt><dd className="num">{info.version}</dd>
          <dt>مكان البيانات</dt><dd className="mono small" style={{ textAlign: 'right', wordBreak: 'break-all' }}>{info.dataPath}</dd>
        </dl>
      )}
      {confirm && (
        <Confirm title="استرجاع نسخة احتياطية" danger={false} confirmText="اختيار الملف"
          message="سيتم دمج بيانات الملف مع البيانات الحالية، والسجلات الأحدث تبقى كما هي."
          onClose={() => setConfirm(false)}
          onConfirm={() => act(() => api.importBackup(), 'تم الاسترجاع')} />
      )}
    </Panel>
  );
}
