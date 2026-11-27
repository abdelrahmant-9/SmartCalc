import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreditCard, LayoutDashboard, Package, Settings, Users } from 'lucide-react';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '../styles.css';
import logo from '../assets/logo.png';
import { VendorProvider } from './state.jsx';
import Overview from './pages/Overview.jsx';
import Customers from './pages/Customers.jsx';
import { Payments, Plans, VendorSettings } from './pages/Other.jsx';

const NAV = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard, page: Overview },
  { id: 'customers', label: 'العملاء', icon: Users, page: Customers },
  { id: 'payments', label: 'المدفوعات', icon: CreditCard, page: Payments },
  { id: 'plans', label: 'الباقات والأسعار', icon: Package, page: Plans },
  { id: 'settings', label: 'الإعدادات', icon: Settings, page: VendorSettings },
];

function VendorApp() {
  const [page, setPage] = useState('overview');
  useEffect(() => { document.documentElement.classList.toggle('is-mac', window.heaven?.platform === 'darwin'); }, []);
  const Page = NAV.find((n) => n.id === page).page;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logo} alt="" />
          <div><div className="brand-name">HEAVEN</div><div className="brand-sub">إدارة العملاء</div></div>
        </div>
        <div className="nav-group">
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
              <n.icon size={17} strokeWidth={1.75} />{n.label}
            </button>
          ))}
        </div>
        <div className="side-foot"><p className="muted small" style={{ padding: '0 8px' }}>للمطور فقط — مش بيتشحن مع البرنامج.</p></div>
      </aside>
      <main className="main"><Page navigate={setPage} /></main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><VendorProvider><VendorApp /></VendorProvider></StrictMode>);
