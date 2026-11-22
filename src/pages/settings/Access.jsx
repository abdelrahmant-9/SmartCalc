import { useEffect, useMemo, useState } from 'react';
import { History, Lock, Pencil, Plus, ShieldCheck, Trash2, UserRound, Wrench } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAction, useApp, useData } from '../../lib/context.jsx';
import { dateTime, latin, num } from '../../lib/format.js';
import Select from '../../components/Select.jsx';
import { Confirm, Empty, Field, Modal, Notice, Panel, Switch } from '../../components/ui.jsx';

const DEV = 'role-developer';
const isDevUser = (u) => u?.role === DEV || u?.role === 'developer';
const roleKey = (u) => ({ admin: 'role-admin', employee: 'role-employee', developer: DEV }[u?.role] || u?.role);

export function useCatalogue() {
  const [cat, setCat] = useState(null);
  useEffect(() => { api.catalogue().then(setCat).catch(() => {}); }, []);
  return cat;
}

// ---------------------------------------------------------------- users
export function Users() {
  const { user: me, can } = useApp();
  const act = useAction();
  const [users] = useData('users');
  const [roles] = useData('roles');
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const iAmDev = can('dev.tools');
  const roleName = (u) => roles.find((r) => r.id === roleKey(u))?.name || '—';
  const roleOptions = roles
    .filter((r) => r.id !== DEV || iAmDev)
    .sort((a, b) => (a.system === b.system ? a.name.localeCompare(b.name) : a.system ? -1 : 1))
    .map((r) => ({ value: r.id, label: r.name }));

  const save = async () => {
    try { await act(() => api.saveUser(edit), 'تم حفظ المستخدم'); setEdit(null); } catch { /* toast */ }
  };
  const supportOnly = edit && edit.id && isDevUser(edit) && !iAmDev;
  const sorted = [...users].sort((a, b) => Number(isDevUser(a)) - Number(isDevUser(b)) || Number(b.active) - Number(a.active));

  return (
    <Panel body={false} title="المستخدمين" meta={users.length}
      actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ role: 'role-employee', active: true, name: '', username: '', password: '' })}><Plus />مستخدم</button>}>
      <table className="table">
        <thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الدور</th><th>التليفون</th><th>الحالة</th><th /></tr></thead>
        <tbody>
          {sorted.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'inactive'}>
              <td>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <div className={`avatar ${isDevUser(u) ? 'avatar-dev' : ''}`}>{isDevUser(u) ? <Wrench size={14} /> : (u.name || '?').trim().slice(0, 1)}</div>
                  <div>
                    <div className="cell-title">{u.name}{u.id === me.id && <span className="tag" style={{ marginRight: 6 }}>أنت</span>}</div>
                    {isDevUser(u) && <div className="cell-sub">حساب الدعم الفني — يمكنك إيقافه في أي وقت</div>}
                  </div>
                </div>
              </td>
              <td className="mono">{u.username}</td>
              <td><span className={`tag ${roleKey(u) === 'role-employee' ? '' : 'tag-brand'}`}>{roleName(u)}</span></td>
              <td className="mono muted">{latin(u.phone) || '—'}</td>
              <td><span className={`status ${u.active ? 'status-ok' : 'status-muted'}`}>{u.active ? 'نشط' : 'موقوف'}</span></td>
              <td className="actions">
                <div>
                  <button className="icon-btn" title="تعديل" onClick={() => setEdit({ ...u, role: roleKey(u), password: '' })}><Pencil /></button>
                  {u.id !== me.id && !isDevUser(u) && <button className="icon-btn danger" title="حذف" onClick={() => setConfirm(u)}><Trash2 /></button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && supportOnly && (
        <Modal title="حساب الدعم الفني" onClose={() => setEdit(null)} footer={(
          <><span className="spacer" /><button className="btn" onClick={() => setEdit(null)}>إلغاء</button><button className="btn btn-primary" onClick={save}>حفظ</button></>
        )}>
          <p className="muted" style={{ marginBottom: 12 }}>
            الحساب ده بيستخدمه مطور البرنامج للصيانة والدعم. تقدر تمنع دخوله في أي وقت وترجعه لما تحتاج دعم.
          </p>
          <Switch label="السماح بدخول الدعم الفني" desc={edit.active ? 'المطور يقدر يدخل' : 'الدخول موقوف'} checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
        </Modal>
      )}
      {edit && !supportOnly && (
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
            <Field label="اسم الدخول" hint="بالإنجليزي بدون مسافات"><input dir="ltr" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase() })} /></Field>
            <Field label="كلمة المرور" hint={edit.id ? 'اتركها فارغة للإبقاء على الحالية' : 'هيُطلب منه تغييرها أول ما يدخل'}>
              <input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
            <Field label="الدور"><Select value={edit.role} onChange={(v) => setEdit({ ...edit, role: v })} options={roleOptions} /></Field>
            <Field label="التليفون"><input dir="ltr" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: latin(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
      {confirm && <Confirm title="حذف مستخدم" confirmText="حذف" message={`حذف ${confirm.name}؟ عملياته السابقة تظل محفوظة.`} onClose={() => setConfirm(null)} onConfirm={() => act(() => api.remove('users', confirm.id), 'تم الحذف')} />}
    </Panel>
  );
}

// ---------------------------------------------------------------- roles
export function Roles() {
  const { user: me } = useApp();
  const act = useAction();
  const cat = useCatalogue();
  const [roles] = useData('roles');
  const [users] = useData('users');
  const [selId, setSelId] = useState('role-employee');
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const mine = useMemo(() => new Set(me.permissions || []), [me]);
  const iAmDev = mine.has('dev.tools');

  const visible = roles
    .filter((r) => r.id !== DEV || iAmDev)
    .sort((a, b) => (a.system === b.system ? 0 : a.system ? -1 : 1));
  const selected = draft?.id === selId || (draft && !draft.id) ? draft : visible.find((r) => r.id === selId);
  const locked = selected?.id === 'role-admin' || selected?.id === DEV;
  const count = (id) => users.filter((u) => roleKey(u) === id).length;
  const effective = (r) => (r?.id === 'role-admin' ? cat?.groups.flatMap((g) => g.items.map((i) => i.key)).filter((k) => !k.startsWith('dev.'))
    : r?.id === DEV ? cat?.groups.flatMap((g) => g.items.map((i) => i.key)) : r?.permissions) || [];

  if (!cat) return null;

  const perms = new Set(draft ? draft.permissions : effective(selected));
  const edit = (patch) => setDraft({ ...(draft || { ...selected, permissions: [...perms] }), ...patch });
  const toggle = (key, on) => {
    const next = new Set(perms);
    if (on) next.add(key); else next.delete(key);
    edit({ permissions: [...next] });
  };
  const save = async () => {
    try {
      const r = await act(() => api.put('roles', draft), 'تم حفظ الدور');
      setDraft(null); setSelId(r.id);
    } catch { /* toast */ }
  };

  return (
    <div className="roles-layout">
      <Panel body={false} title="الأدوار" actions={<button className="btn btn-primary btn-sm" onClick={() => { setSelId(null); setDraft({ name: '', description: '', permissions: [] }); }}><Plus />دور جديد</button>}>
        <div className="role-list">
          {visible.map((r) => (
            <button key={r.id} className={`role-item ${selId === r.id && !(draft && !draft.id) ? 'active' : ''}`} onClick={() => { setSelId(r.id); setDraft(null); }}>
              <span className="role-icon">{r.id === DEV ? <Wrench /> : r.id === 'role-admin' ? <ShieldCheck /> : <UserRound />}</span>
              <span className="role-text">
                <strong>{r.name} {(r.id === 'role-admin' || r.id === DEV) && <Lock size={12} className="muted" />}</strong>
                <small>{num(effective(r).length)} صلاحية · {num(count(r.id))} مستخدم</small>
              </span>
            </button>
          ))}
          {draft && !draft.id && <div className="role-item active"><span className="role-icon"><Plus /></span><span className="role-text"><strong>{draft.name || 'دور جديد'}</strong><small>لم يُحفظ بعد</small></span></div>}
        </div>
      </Panel>

      {selected && (
        <Panel body={false}
          title={locked ? selected.name : <input className="title-input" value={(draft || selected).name} placeholder="اسم الدور" onChange={(e) => edit({ name: e.target.value })} />}
          actions={!locked && (
            <>
              {selected.id && !selected.system && <button className="btn btn-sm btn-danger-quiet" onClick={() => setConfirm(true)}><Trash2 />حذف</button>}
              {draft && <button className="btn btn-sm" onClick={() => { setDraft(null); if (!selected.id) setSelId('role-employee'); }}>إلغاء</button>}
              <button className="btn btn-sm btn-primary" disabled={!draft || !String(draft.name || '').trim()} onClick={save}>حفظ</button>
            </>
          )}>
          <div className="panel-body" style={{ paddingBottom: 0 }}>
            {locked
              ? <Notice icon={Lock}>{selected.id === DEV ? 'دور المطور: كل الصلاحيات بما فيها أدوات الصيانة. ثابت ولا يتعدل.' : 'دور المدير: كل الصلاحيات ماعدا أدوات المطور. ثابت ولا يتعدل، اعمل دور جديد لو محتاج صلاحيات مختلفة.'}</Notice>
              : <input className="desc-input" value={(draft || selected).description || ''} placeholder="وصف قصير (اختياري)" onChange={(e) => edit({ description: e.target.value })} />}
          </div>
          <div className="perm-groups">
            {cat.groups.filter((g) => !g.developer || iAmDev).map((g) => {
              const keys = g.items.map((i) => i.key);
              const onCount = keys.filter((k) => perms.has(k)).length;
              const grantable = keys.filter((k) => mine.has(k));
              return (
                <section key={g.id} className="perm-group">
                  <div className="perm-group-head">
                    <strong>{g.label}</strong>
                    <span className="muted small">{onCount} / {keys.length}</span>
                    {!locked && grantable.length > 0 && (
                      <button className="btn btn-sm btn-quiet" onClick={() => {
                        const next = new Set(perms);
                        const all = grantable.every((k) => perms.has(k));
                        grantable.forEach((k) => (all ? next.delete(k) : next.add(k)));
                        edit({ permissions: [...next] });
                      }}>{grantable.every((k) => perms.has(k)) ? 'إلغاء الكل' : 'تحديد الكل'}</button>
                    )}
                  </div>
                  {g.items.map((i) => (
                    <Switch key={i.key} label={i.label} checked={perms.has(i.key)} disabled={locked || !mine.has(i.key)}
                      desc={!locked && !mine.has(i.key) ? 'لا يمكنك منح صلاحية ليست عندك' : null}
                      onChange={(v) => toggle(i.key, v)} />
                  ))}
                </section>
              );
            })}
          </div>
        </Panel>
      )}
      {confirm && <Confirm title="حذف الدور" confirmText="حذف" message={`حذف دور "${selected.name}"؟`} onClose={() => setConfirm(false)}
        onConfirm={async () => { await act(() => api.remove('roles', selected.id), 'تم حذف الدور'); setSelId('role-employee'); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- activity log
const TBL = {
  bookings: 'الحجوزات', payments: 'الدفعات', ticket_sales: 'التذاكر', cafe_orders: 'الكافيه', transactions: 'المصروفات والإيرادات',
  users: 'المستخدمين', roles: 'الأدوار', settings: 'الإعدادات', packages: 'الباكدجات', extras: 'الإضافات', ticket_types: 'أسعار التذاكر', cafe_items: 'المنيو',
};
const ACTION = { create: ['إضافة', 'ok'], update: ['تعديل', 'info'], delete: ['حذف', 'danger'] };

export function Activity() {
  const { toast } = useApp();
  const [users] = useData('users');
  const [who, setWho] = useState('all');
  const [section, setSection] = useState('all');
  const [rows, setRows] = useState([]);
  const [done, setDone] = useState(false);

  const load = async (before = null) => {
    try {
      const r = await api.activity({ limit: 150, before, userId: who === 'all' ? null : who });
      setRows((x) => (before ? [...x, ...r] : r));
      setDone(r.length < 150);
    } catch (e) { toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, [who]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = section === 'all' ? rows : rows.filter((r) => r.tbl === section);

  return (
    <Panel body={false} title="سجل النشاط" meta="مين عمل إيه ومتى"
      actions={(
        <>
          <Select value={who} onChange={setWho} aria-label="المستخدم" options={[{ value: 'all', label: 'كل المستخدمين' }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
          <Select value={section} onChange={setSection} aria-label="القسم" options={[{ value: 'all', label: 'كل الأقسام' }, ...Object.entries(TBL).map(([value, label]) => ({ value, label }))]} />
        </>
      )}>
      {shown.length === 0 ? <Empty icon={History}>لا يوجد نشاط</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key}>
                  <td className="num">{dateTime(r.at)}</td>
                  <td>{r.user}</td>
                  <td><span className={`status status-${ACTION[r.action][1]}`}>{ACTION[r.action][0]}</span></td>
                  <td className="muted">{TBL[r.tbl] || r.tbl}</td>
                  <td><div className="cell-title">{r.summary}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!done && <div className="more-row"><button className="btn btn-sm" onClick={() => load(rows[rows.length - 1]?.at)}>عرض أقدم</button></div>}
        </div>
      )}
    </Panel>
  );
}

