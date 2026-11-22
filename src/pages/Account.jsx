import { useMemo, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, ShieldCheck, UserRound, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp, useData } from '../lib/context.jsx';
import { dateTime, latin, money, num, startOfMonth, today } from '../lib/format.js';
import { movements, summarize } from '../lib/finance.js';
import { Field, Metric, Metrics, Notice, Page, Panel } from '../components/ui.jsx';
import { useCatalogue } from './settings/Access.jsx';

function PasswordInput({ value, onChange, autoComplete, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-input">
      <input type={show ? 'text' : 'password'} dir="ltr" value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} />
      <button type="button" className="pw-eye" tabIndex={-1} onClick={() => setShow(!show)} aria-label={show ? 'إخفاء' : 'إظهار'}>{show ? <EyeOff /> : <Eye />}</button>
    </div>
  );
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/\d/.test(pw) && /[a-z؀-ۿ]/i.test(pw)) s++;
  if (/[^a-z0-9؀-ۿ]/i.test(pw) || /[A-Z]/.test(pw)) s++;
  return Math.min(s, 4);
}
const STRENGTH = ['ضعيفة جداً', 'ضعيفة', 'متوسطة', 'قوية', 'قوية جداً'];

export default function Account() {
  const { user, setUser, toast, currency } = useApp();
  const cat = useCatalogue();
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone || '' });
  const [pw, setPw] = useState({ old: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  // My own operations this month.
  const t = today(); const m = startOfMonth(t);
  const opts = { field: 'date', from: m, to: t };
  const deps = [m, t];
  const [payments] = useData('payments', opts, deps);
  const [ticketSales] = useData('ticket_sales', opts, deps);
  const [cafeOrders] = useData('cafe_orders', opts, deps);
  const [transactions] = useData('transactions', opts, deps);
  const mine = useMemo(() => movements({ payments, ticketSales, cafeOrders, transactions }).filter((x) => x.user === user.id), [payments, ticketSales, cafeOrders, transactions, user.id]);
  const todayS = summarize(mine.filter((x) => x.date === t));
  const monthS = summarize(mine);
  const todayCount = mine.filter((x) => x.date === t).length;

  const s = strength(pw.next);
  const checks = [
    [pw.next.length >= 4, '4 حروف على الأقل'],
    [pw.next.length >= 8, '8 حروف أو أكتر (أفضل)'],
    [/\d/.test(pw.next) && /\D/.test(pw.next), 'حروف وأرقام مع بعض'],
    [pw.next && pw.next === pw.confirm, 'التأكيد مطابق'],
  ];

  const saveProfile = async (e) => {
    e.preventDefault();
    try { const u = await api.updateProfile({ name: profile.name, phone: latin(profile.phone) }); setUser(u); toast('تم حفظ بياناتك'); } catch (err) { toast(err.message, 'error'); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast('كلمتا المرور غير متطابقتين', 'error'); return; }
    setBusy(true);
    try {
      const u = await api.changePassword(pw.old, pw.next);
      setUser(u); setPw({ old: '', next: '', confirm: '' }); toast('تم تغيير كلمة المرور');
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  const myPerms = new Set(user.permissions || []);
  const groups = (cat?.groups || []).map((g) => ({ ...g, items: g.items.filter((i) => myPerms.has(i.key)) })).filter((g) => g.items.length);
  const profileDirty = profile.name !== user.name || profile.phone !== (user.phone || '');

  return (
    <Page title="حسابي">
      <section className="profile-hero">
        <div className="avatar avatar-xl">{(user.name || '?').trim().slice(0, 1)}</div>
        <div className="profile-main">
          <h2>{user.name}</h2>
          <div className="profile-meta">
            <span className="tag tag-brand"><ShieldCheck size={13} />{user.role_name}</span>
            <span className="mono">@{user.username}</span>
            {user.phone && <span className="mono">{latin(user.phone)}</span>}
          </div>
        </div>
        <dl className="profile-facts">
          <div><dt>آخر دخول قبل ده</dt><dd className="num">{user.last_login ? dateTime(user.last_login) : 'أول مرة'}</dd></div>
          <div><dt>آخر تغيير لكلمة المرور</dt><dd className="num">{user.password_changed_at ? dateTime(user.password_changed_at) : '—'}</dd></div>
        </dl>
      </section>

      {user.must_change_password && (
        <Notice tone="warn" icon={KeyRound}>كلمة المرور الحالية مؤقتة أو افتراضية — غيّرها من تحت عشان تحمي حسابك.</Notice>
      )}

      <Metrics>
        <Metric label="عملياتي النهارده" value={num(todayCount)} />
        <Metric label="حصّلت النهارده" amount={todayS.in} currency={currency} sub={todayS.out ? `صرفت ${money(todayS.out, currency)}` : null} />
        <Metric label="عملياتي الشهر ده" value={num(mine.length)} />
        <Metric label="حصّلت الشهر ده" amount={monthS.in} currency={currency} />
      </Metrics>

      <div className="cols-2 equal">
        <Panel title="بياناتي">
          <form onSubmit={saveProfile}>
            <div className="form-grid">
              <Field label="الاسم" span={2}><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
              <Field label="التليفون"><input dir="ltr" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: latin(e.target.value) })} /></Field>
              <Field label="اسم الدخول" hint="يغيّره المدير من المستخدمين"><input dir="ltr" value={user.username} disabled /></Field>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={!profileDirty || !profile.name.trim()}>حفظ البيانات</button>
            </div>
          </form>
        </Panel>

        <Panel title="كلمة المرور">
          <form onSubmit={savePw}>
            <div className="form-grid">
              <Field label="كلمة المرور الحالية" span={2}><PasswordInput value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" /></Field>
              <Field label="الجديدة"><PasswordInput value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
              <Field label="تأكيد الجديدة"><PasswordInput value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
            </div>
            {pw.next && (
              <div className="pw-strength">
                <div className="pw-bars">{[0, 1, 2, 3].map((i) => <span key={i} className={i < s ? `on s${s}` : ''} />)}</div>
                <span className="small muted">{STRENGTH[s]}</span>
              </div>
            )}
            <ul className="pw-checks">
              {checks.map(([ok, label]) => <li key={label} className={ok ? 'ok' : ''}>{ok ? <Check /> : <X />}{label}</li>)}
            </ul>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" disabled={busy || !pw.old || pw.next.length < 4 || pw.next !== pw.confirm}>تغيير كلمة المرور</button>
            </div>
          </form>
        </Panel>
      </div>

      <Panel title="صلاحياتي" meta={`${num(myPerms.size)} صلاحية — دور ${user.role_name}`}>
        {groups.length === 0 ? <p className="muted">لا توجد صلاحيات</p> : (
          <div className="perm-summary">
            {groups.map((g) => (
              <div key={g.id}>
                <div className="perm-summary-title"><UserRound size={14} />{g.label}</div>
                <div className="chips">{g.items.map((i) => <span key={i.key} className="tag">{i.label}</span>)}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </Page>
  );
}
