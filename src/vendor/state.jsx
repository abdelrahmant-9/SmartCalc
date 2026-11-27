import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { v } from './vapi.js';
import { addDays, ltr, today } from '../lib/format.js';

const Ctx = createContext(null);

export function VendorProvider({ children }) {
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);
  const refresh = useCallback(() => setVersion((x) => x + 1), []);
  const toast = useCallback((message, type = 'success') => {
    const n = ++id.current;
    setToasts((t) => [...t, { id: n, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n)), type === 'error' ? 5000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={{ version, refresh, toast }}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast toast-${t.type}`}>{t.type === 'error' ? <CircleAlert /> : <CircleCheck />}{t.message}</div>)}</div>
    </Ctx.Provider>
  );
}

export const useV = () => useContext(Ctx);

export function useRows(tbl) {
  const { version, toast } = useV();
  const [rows, setRows] = useState([]);
  useEffect(() => { v.list(tbl).then(setRows).catch((e) => toast(e.message, 'error')); }, [tbl, version, toast]);
  return rows;
}

const DAY = 86400000;
export const daysLeft = (iso) => (iso ? Math.round((new Date(`${iso}T00:00:00`) - new Date(`${today()}T00:00:00`)) / DAY) : null);

// One place that decides how a customer is doing.
export function statusOf(c) {
  if (c.status === 'suspended') return { key: 'suspended', label: 'موقوف', tone: 'muted' };
  if (c.type === 'perpetual') {
    const d = daysLeft(c.support_until);
    return { key: 'perpetual', label: 'شراء نهائي', tone: 'ok', days: d, sub: c.support_until ? (d >= 0 ? `دعم لحد ${ltr(c.support_until)}` : 'الدعم انتهى') : 'بدون دعم' };
  }
  if (!c.expires_at) return { key: 'new', label: 'لم يُفعّل', tone: 'muted' };
  const d = daysLeft(c.expires_at);
  if (d > 7) return { key: 'active', label: 'ساري', tone: 'ok', days: d };
  if (d >= 0) return { key: 'expiring', label: 'ينتهي قريب', tone: 'warn', days: d };
  if (d >= -5) return { key: 'grace', label: 'فترة سماح', tone: 'danger', days: d };
  return { key: 'expired', label: 'منتهي', tone: 'danger', days: d };
}

export const remainingLabel = (s) => {
  if (s.days === undefined || s.days === null) return s.sub || '—';
  if (s.key === 'perpetual') return s.sub;
  if (s.days > 0) return `باقي ${s.days} يوم`;
  if (s.days === 0) return 'بينتهي النهارده';
  return `منتهي من ${-s.days} يوم`;
};

export { addDays };
