import { createContext, useContext, useEffect, useState } from 'react';
import { Inbox, Info, TriangleAlert, X } from 'lucide-react';
import { BOOKING_STATUS } from '../lib/finance.js';
import { num } from '../lib/format.js';

// Banner (e.g. "change default password") shown at the top of every page.
export const BannerCtx = createContext(null);

export function Page({ title, sub, actions, tabs, children }) {
  const banner = useContext(BannerCtx);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {tabs}
      <div className="content">
        {banner}
        {children}
      </div>
    </>
  );
}

export function Panel({ title, meta, actions, children, body = true, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <h3>{title}{meta !== undefined && meta !== null && <span className="meta">{meta}</span>}</h3>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {body ? <div className="panel-body">{children}</div> : children}
    </section>
  );
}

export function Modal({ title, sub, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, span }) {
  return (
    <label className={`field ${span === 2 ? 'span-2' : span ? 'span-all' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Metrics({ children, flat }) {
  return <div className={`metrics ${flat ? 'flat' : ''}`}>{children}</div>;
}

// A money value is passed as `amount` so the currency renders quieter than the number.
export function Metric({ label, value, amount, currency, sub, tone }) {
  return (
    <div className={`metric ${tone ? `tone-${tone}` : ''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {amount !== undefined ? <>{num(amount)}<small>{currency}</small></> : value}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const s = BOOKING_STATUS[status] || BOOKING_STATUS.pending;
  return <span className={`status status-${s.tone}`}>{s.label}</span>;
}

// Render long lists in pages so a year of data stays fast; resets when `resetKey` changes.
export function useShowMore(rows, step = 100, resetKey = '') {
  const [n, setN] = useState(step);
  useEffect(() => { setN(step); }, [resetKey, step]);
  const footer = rows.length > n ? (
    <div className="more-row">
      <span>معروض {num(n)} من {num(rows.length)}</span>
      <button className="btn btn-sm" onClick={() => setN(n + step * 2)}>عرض المزيد</button>
      <button className="btn btn-sm btn-quiet" onClick={() => setN(rows.length)}>عرض الكل</button>
    </div>
  ) : null;
  return [rows.length > n ? rows.slice(0, n) : rows, footer];
}

export function Empty({ icon: Icon = Inbox, children = 'لا توجد بيانات' }) {
  return <div className="empty"><Icon />{children}</div>;
}

export function Notice({ tone = 'info', icon, children }) {
  const Icon = icon || (tone === 'info' ? Info : TriangleAlert);
  return <div className={`notice notice-${tone}`}><Icon />{children}</div>;
}

export function Confirm({ title = 'تأكيد', message, onConfirm, onClose, danger = true, confirmText = 'تأكيد' }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} footer={(
      <>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch { setBusy(false); } }}
        >{confirmText}</button>
      </>
    )}>
      <p>{message}</p>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </nav>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(({ id, label, icon: Icon }) => (
        <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          {Icon && <Icon />}{label}
        </button>
      ))}
    </div>
  );
}

export function MoneyInput({ value, onChange, ...rest }) {
  return (
    <input
      type="number" inputMode="decimal" min="0" step="any" value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      {...rest}
    />
  );
}

export function MethodSelect({ value, onChange, methods }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {(methods || ['كاش']).map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );
}

export function Switch({ label, desc, checked, onChange }) {
  return (
    <label className="switch">
      <span className="switch-text"><strong>{label}</strong>{desc && <span>{desc}</span>}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track"><span className="switch-thumb" /></span>
    </label>
  );
}
