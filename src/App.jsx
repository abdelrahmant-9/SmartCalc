import { useState } from 'react';
import { useApp } from './lib/context.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Bookings from './pages/Bookings.jsx';
import Tickets from './pages/Tickets.jsx';
import Cafe from './pages/Cafe.jsx';
import Finance from './pages/Finance.jsx';
import Settings from './pages/Settings.jsx';
import Account from './pages/Account.jsx';
import SyncIndicator from './components/SyncIndicator.jsx';
import logo from './assets/logo.png';

const NAV = [
  { id: 'dashboard', label: 'الرئيسية', icon: '◈', roles: ['admin', 'employee'] },
  { id: 'bookings', label: 'الحجوزات', icon: '❀', roles: ['admin', 'employee'] },
  { id: 'tickets', label: 'تذاكر الدخول', icon: '✦', roles: ['admin', 'employee'] },
  { id: 'cafe', label: 'الكافيه', icon: '☕', roles: ['admin', 'employee'] },
  { id: 'finance', label: 'الحسابات', icon: '◎', roles: ['admin', 'employee'] },
  { id: 'settings', label: 'الإعدادات', icon: '⚙', roles: ['admin'] },
  { id: 'account', label: 'حسابي', icon: '☺', roles: ['admin', 'employee'] },
];

const PAGES = { dashboard: Dashboard, bookings: Bookings, tickets: Tickets, cafe: Cafe, finance: Finance, settings: Settings, account: Account };

export default function App() {
  const { user, ready, logout, isAdmin } = useApp();
  const [page, setPage] = useState('dashboard');

  if (!ready) return <div className="splash"><img src={logo} alt="Heaven" /></div>;
  if (!user) return <Login />;

  const nav = NAV.filter((n) => n.roles.includes(user.role));
  const current = nav.some((n) => n.id === page) ? page : 'dashboard';
  const Page = PAGES[current];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logo} alt="Heaven" />
          <div>
            <div className="brand-name">Heaven</div>
            <div className="brand-sub">{isAdmin ? 'لوحة المدير' : 'شاشة الموظف'}</div>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <button key={n.id} className={`nav-item ${current === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <SyncIndicator />
          <div className="user-chip">
            <div className="avatar">{(user.name || '?').slice(0, 1)}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{isAdmin ? 'مدير' : 'موظف'}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={logout}>تسجيل الخروج</button>
        </div>
      </aside>
      <main className="content">
        {user.must_change_password && current !== 'account' && (
          <div className="alert alert-warn">
            أنت تستخدم كلمة المرور الافتراضية. <button className="link" onClick={() => setPage('account')}>غيّرها الآن</button> لحماية البيانات.
          </div>
        )}
        <Page navigate={setPage} />
      </main>
    </div>
  );
}
