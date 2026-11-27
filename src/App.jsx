import { useEffect, useState } from 'react';
import { CalendarHeart, Coffee, LayoutDashboard, LogOut, Settings, Ticket, UserRound, Wallet } from 'lucide-react';
import { useApp } from './lib/context.jsx';
import { api } from './lib/api.js';
import { ltr } from './lib/format.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Bookings from './pages/Bookings.jsx';
import Tickets from './pages/Tickets.jsx';
import Cafe from './pages/Cafe.jsx';
import Finance from './pages/Finance.jsx';
import Settings_ from './pages/Settings.jsx';
import Account from './pages/Account.jsx';
import SyncIndicator from './components/SyncIndicator.jsx';
import { BannerCtx, Notice } from './components/ui.jsx';
import { brand, productLogo as logo } from './lib/brand.js';

const isMac = window.heaven?.platform === 'darwin';
const MOD = isMac ? '⌘' : 'Ctrl+';

const NAV = [
  {
    label: 'التشغيل',
    items: [
      { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
      { id: 'bookings', label: 'الحجوزات', icon: CalendarHeart, perms: ['bookings.view'] },
      { id: 'tickets', label: 'تذاكر الدخول', icon: Ticket, perms: ['tickets.sell'] },
      { id: 'cafe', label: 'الكافيه', icon: Coffee, perms: ['cafe.sell', 'cafe.accounts'] },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { id: 'finance', label: 'الحسابات', icon: Wallet },
      { id: 'settings', label: 'الإعدادات', icon: Settings, perms: ['settings.general', 'settings.catalog', 'settings.users', 'settings.roles', 'settings.sync', 'settings.backup', 'audit.view', 'dev.tools'] },
      { id: 'account', label: 'حسابي', icon: UserRound },
    ],
  },
];

const PAGES = { dashboard: Dashboard, bookings: Bookings, tickets: Tickets, cafe: Cafe, finance: Finance, settings: Settings_, account: Account };

export default function App() {
  const { user, ready, logout, canAny, can, license, branding } = useApp();
  const [page, setPage] = useState('dashboard');
  const [demo, setDemo] = useState(false);
  useEffect(() => { api.appInfo().then((i) => { setDemo(!!i.demo); if (i.demo) document.title = `${brand.productName} — نسخة تجريبية`; }).catch(() => {}); }, []);

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perms || canAny(...i.perms)) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => {
    document.documentElement.classList.toggle('is-mac', isMac);
    // In full screen the window buttons are hidden, so the space kept for them goes too.
    return api.on('window:fullscreen', (on) => document.documentElement.classList.toggle('is-fullscreen', !!on));
  }, []);

  // ⌘1…⌘7 / Ctrl+1…7 to jump between sections.
  useEffect(() => {
    if (!user) return undefined;
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= flat.length) { e.preventDefault(); setPage(flat[n - 1].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, flat]);

  const brandLogo = branding?.logo || logo;
  if (!ready) return <div className="splash"><img src={brandLogo} alt="" /></div>;
  if (!user) return <Login />;

  const current = flat.some((n) => n.id === page) ? page : 'dashboard';
  const Page = PAGES[current];
  const openLicense = () => { sessionStorage.setItem('settingsTab', 'license'); setPage('settings'); };
  const canLicense = can('settings.general') || can('dev.tools');
  const licenseBanner = licenseNotice(license, canLicense ? openLicense : null);
  const banner = licenseBanner && current !== 'settings' ? licenseBanner : demo ? (
    <Notice tone="info">نسخة تجريبية ببيانات وهمية — بياناتك الحقيقية في البرنامج العادي ولم تتأثر.</Notice>
  ) : user.must_change_password && current !== 'account' ? (
    <Notice tone="warn">
      كلمة المرور الحالية هي الافتراضية.
      <span className="spacer" />
      <button className="link" onClick={() => setPage('account')}>تغيير كلمة المرور</button>
    </Notice>
  ) : null;

  let index = 0;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={brandLogo} alt="" />
          <div>
            <div className="brand-name">{(branding?.name || brand.shortName).toUpperCase()}</div>
            <div className="brand-sub">{user.role_name}</div>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.label} className="nav-group">
            <div className="nav-label">{g.label}</div>
            {g.items.map((n) => {
              index += 1;
              const Icon = n.icon;
              return (
                <button key={n.id} className={`nav-item ${current === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
                  <Icon size={17} strokeWidth={1.75} />
                  {n.label}
                  <span className="nav-kbd">{MOD}{index}</span>
                </button>
              );
            })}
          </div>
        ))}
        <div className="side-foot">
          <SyncIndicator />
          <div className="user-card">
            <div className="avatar">{(user.name || '?').trim().slice(0, 1)}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role_name}</div>
            </div>
            <button className="icon-btn" title="تسجيل الخروج" onClick={logout}><LogOut /></button>
          </div>
        </div>
      </aside>
      <main className="main">
        <BannerCtx.Provider value={banner}>
          <Page navigate={setPage} />
        </BannerCtx.Provider>
      </main>
    </div>
  );
}

function licenseNotice(l, onOpen) {
  if (!l || l.state === 'off') return null;
  if (['perpetual', 'active'].includes(l.state)) {
    // Remind a few days before the device must go online.
    if (l.offline && l.offline.left_days <= 3) return <Notice tone="warn">وصّل الجهاز بالإنترنت خلال {l.offline.left_days} يوم عشان التحقق من الاشتراك.{onOpen && <><span className="spacer" /><button className="link" onClick={onOpen}>تحقق الآن</button></>}</Notice>;
    return null;
  }
  const action = onOpen && <><span className="spacer" /><button className="link" onClick={onOpen}>{l.state === 'trial' ? 'تفعيل الترخيص' : 'تجديد الاشتراك'}</button></>;
  if (l.state === 'trial') return <Notice tone="info">نسخة تجريبية — باقي {l.days} يوم.{action}</Notice>;
  if (l.state === 'expiring') return <Notice tone="warn">الاشتراك بينتهي {l.days === 0 ? 'النهارده' : `بعد ${l.days} يوم`} ({ltr(l.expires)}).{action}</Notice>;
  if (l.state === 'grace') return <Notice tone="danger">الاشتراك انتهى. باقي {l.grace_left} يوم والبرنامج يبقى للعرض فقط.{action}</Notice>;
  if (l.state === 'checkin_required') return <Notice tone="danger">لازم الجهاز يتصل بالإنترنت مرة للتحقق من الاشتراك — البرنامج للعرض فقط لحد كده.{onOpen && <><span className="spacer" /><button className="link" onClick={onOpen}>تحقق الآن</button></>}</Notice>;
  if (l.state === 'suspended') return <Notice tone="danger">الاشتراك موقوف من الدعم الفني{l.reason ? ` (${l.reason})` : ''} — البرنامج للعرض فقط. تواصل مع الدعم.</Notice>;
  const why = { trial_ended: 'الفترة التجريبية خلصت', expired: 'الاشتراك منتهي', invalid: 'مفتاح الترخيص غير صالح' }[l.state] || 'غير مرخص';
  return <Notice tone="danger">{why} — البرنامج للعرض فقط ومينفعش تسجيل عمليات جديدة.{action}</Notice>;
}
