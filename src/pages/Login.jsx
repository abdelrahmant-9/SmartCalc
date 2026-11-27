import { useState } from 'react';
import { useApp } from '../lib/context.jsx';
import { Notice } from '../components/ui.jsx';
import { brand, productLogo as logo } from '../lib/brand.js';

export default function Login() {
  const { login, branding } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(username, password); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-form">
        <form onSubmit={submit}>
          <h1>تسجيل الدخول</h1>
          <p className="sub">ادخل باسم المستخدم الخاص بك.</p>
          <label className="field">
            <span className="field-label">اسم المستخدم</span>
            <input autoFocus dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span className="field-label">كلمة المرور</span>
            <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error && <Notice tone="danger">{error}</Notice>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !username || !password}>دخول</button>
          <p className="login-foot">{brand.productName}{brand.company ? ` — ${brand.company}` : ''}</p>
        </form>
      </div>
      <div className="login-art" aria-hidden="true">
        <img src={branding?.logo || logo} alt="" />
        <div className="word">{(branding?.name || brand.shortName).toUpperCase()}</div>
        {branding?.tagline && <div className="tagline">{branding.tagline}</div>}
      </div>
    </div>
  );
}
