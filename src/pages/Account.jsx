import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { Field, Page, Panel } from '../components/ui.jsx';

export default function Account() {
  const { user, setUser, toast } = useApp();
  const [form, setForm] = useState({ old: '', next: '', confirm: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) { toast('كلمتا المرور غير متطابقتين', 'error'); return; }
    try {
      const u = await api.changePassword(form.old, form.next);
      setUser(u);
      setForm({ old: '', next: '', confirm: '' });
      toast('تم تغيير كلمة المرور');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Page title="حسابي" sub={<span>{user.name} · <span className="mono">{user.username}</span></span>}>
      <Panel title="كلمة المرور" className="narrow">
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="كلمة المرور الحالية" span={2}><input type="password" value={form.old} onChange={set('old')} /></Field>
            <Field label="كلمة المرور الجديدة"><input type="password" value={form.next} onChange={set('next')} /></Field>
            <Field label="تأكيد كلمة المرور"><input type="password" value={form.confirm} onChange={set('confirm')} /></Field>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={!form.old || !form.next}>حفظ</button>
          </div>
        </form>
      </Panel>
    </Page>
  );
}
