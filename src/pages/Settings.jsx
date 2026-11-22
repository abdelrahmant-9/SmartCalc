import { useEffect, useState } from 'react';
import { Copy, Download, Pencil, Plus, Printer, RefreshCw, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAction, useApp, useData } from '../lib/context.jsx';
import { dateTime, durationLabel, latin, num } from '../lib/format.js';
import schemaSql from '../../supabase/schema.sql?raw';
import { printReceipt } from '../lib/print.js';
import Combobox from '../components/Combobox.jsx';
import Select from '../components/Select.jsx';
import { Activity, Roles, Users } from './settings/Access.jsx';
import Developer from './settings/Developer.jsx';
import { Confirm, Empty, Field, Modal, MoneyInput, Page, Panel, Switch, Tabs } from '../components/ui.jsx';

const TABS = [
  { id: 'general', label: 'عام', perm: 'settings.general' },
  { id: 'packages', label: 'الباكدجات', perm: 'settings.catalog' },
  { id: 'extras', label: 'الإضافات', perm: 'settings.catalog' },
  { id: 'tickets', label: 'التذاكر', perm: 'settings.catalog' },
  { id: 'menu', label: 'المنيو', perm: 'settings.catalog' },
  { id: 'users', label: 'المستخدمين', perm: 'settings.users' },
  { id: 'roles', label: 'الصلاحيات', perm: 'settings.roles' },
  { id: 'activity', label: 'سجل النشاط', perm: 'audit.view' },
  { id: 'sync', label: 'المزامنة', perm: 'settings.sync' },
  { id: 'backup', label: 'النسخ الاحتياطي', perm: 'settings.backup' },
  { id: 'developer', label: 'المطور', perm: 'dev.tools' },
];

const PRICING = { fixed: 'سعر ثابت', hourly: 'بالساعة', custom: 'يحدد لكل حجز' };

export default function Settings() {
  const { can } = useApp();
  const tabs = TABS.filter((t) => can(t.perm));
  const [picked, setTab] = useState(tabs[0]?.id);
  const tab = tabs.some((t) => t.id === picked) ? picked : tabs[0]?.id;
  return (
    <Page title="الإعدادات" tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} />}>
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
      {tab === 'roles' && <Roles />}
      {tab === 'activity' && <Activity />}
      {tab === 'developer' && <Developer />}
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
          </div>
        </Panel>
        <Panel title="الحجوزات في نفس التوقيت">
          <Switch label="تحديد حد أقصى" desc={f.limitConcurrent ? `حد أقصى ${f.maxConcurrentBookings || 1} حجز في نفس الوقت` : 'بدون حد — أي عدد من الحجوزات في نفس الوقت'}
            checked={f.limitConcurrent} onChange={(v) => set('limitConcurrent', v)} />
          {f.limitConcurrent && (
            <>
              <div className="form-grid" style={{ padding: '12px 0' }}>
                <Field label="أقصى عدد حجوزات في نفس التوقيت">
                  <input type="number" min="1" value={f.maxConcurrentBookings} onChange={(e) => set('maxConcurrentBookings', Math.max(1, Number(e.target.value) || 1))} />
                </Field>
              </div>
              <Switch label="منع الحجز عند التجاوز" desc={f.blockOverLimit ? 'الحجز مش هيتسجل (إلا لصاحب صلاحية التجاوز)' : 'تنبيه بس والموظف يقرر'}
                checked={f.blockOverLimit} onChange={(v) => set('blockOverLimit', v)} />
            </>
          )}
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
