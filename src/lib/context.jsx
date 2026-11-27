import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { api } from './api.js';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(null);
  const [license, setLicense] = useState(null);
  const [branding, setBranding] = useState({ name: '', tagline: '', logo: null });
  const [version, setVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const toast = useCallback((message, type = 'success') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 5000 : 2800);
  }, []);

  useEffect(() => {
    api.me().then(setUser).catch(() => {}).finally(() => setReady(true));
    api.syncStatus().then(setSyncStatus).catch(() => {});
    // The license can change with the clock, so look again every few minutes.
    const check = () => api.license().then(setLicense).catch(() => {});
    check();
    const timer = setInterval(check, 5 * 60000);
    const off1 = api.on('data:changed', () => setVersion((v) => v + 1));
    const off2 = api.on('sync:status', setSyncStatus);
    const off3 = api.on('license:changed', setLicense);
    // Back online: check right away instead of waiting for the next scheduled check.
    const onOnline = () => api.checkLicense().then(setLicense).catch(() => {});
    window.addEventListener('online', onOnline);
    return () => { off1(); off2(); off3(); clearInterval(timer); window.removeEventListener('online', onOnline); };
  }, []);

  useEffect(() => {
    api.branding().then(setBranding).catch(() => {});
    api.license().then(setLicense).catch(() => {});
  }, [version]);

  useEffect(() => {
    if (!user) return;
    api.get('settings', 'app').then((s) => setSettings({ receiptPaper: '80mm', venuePhone: '01124545323', venueAddress: 'طريق شبين الكوم - قويسنا', ...s })).catch(() => {});
    // Pick up role/active changes that arrived via sync.
    api.me().then((u) => { if (!u) setUser(null); else if (JSON.stringify(u) !== JSON.stringify(user)) setUser(u); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, version]);

  const login = async (u, p) => { const me = await api.login(u, p); setUser(me); refresh(); return me; };
  const logout = async () => { await api.logout(); setUser(null); };

  const value = {
    user, setUser, ready, settings: settings || {}, version, refresh, toast,
    syncStatus, setSyncStatus, login, logout,
    license, setLicense, branding, readOnly: license ? !license.writable : false,
    can: (perm) => !!user?.permissions?.includes(perm),
    canAny: (...perms) => perms.some((p) => user?.permissions?.includes(p)),
    currency: settings?.currency || 'ج.م',
  };
  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'error' ? <CircleAlert /> : <CircleCheck />}{t.message}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);

// Load rows from a table and reload whenever local data changes (or deps change).
export function useData(tbl, opts, deps = []) {
  const { version, toast } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(opts || {});
  useEffect(() => {
    let alive = true;
    api.list(tbl, opts)
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tbl, key, version, ...deps]);
  return [rows, loading];
}

// Run an async action with a success / error toast, then refresh all views.
export function useAction() {
  const { toast, refresh } = useApp();
  return useCallback(async (fn, successMsg) => {
    try {
      const r = await fn();
      if (successMsg) toast(successMsg);
      refresh();
      return r;
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  }, [toast, refresh]);
}
