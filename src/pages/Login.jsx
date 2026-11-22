import { useState } from 'react';
import { useApp } from '../lib/context.jsx';
import logo from '../assets/logo.png';

export default function Login() {
  const { login } = useApp();
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
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="Heaven" className="login-logo" />
        <h1>Heaven Manager</h1>
        <p className="muted">نظام الحجوزات والحسابات</p>
        <label className="field">
          <span className="field-label">اسم المستخدم</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label className="field">
          <span className="field-label">كلمة المرور</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="alert alert-danger">{error}</div>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy || !username || !password}>دخول</button>
        <p className="muted small">أول مرة؟ ادخل بـ admin / admin ثم غيّر كلمة المرور.</p>
      </form>
    </div>
  );
}
