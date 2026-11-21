import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { dateTime } from '../lib/format.js';

const LABELS = {
  off: ['غير مفعّلة', 'muted'],
  idle: ['متزامن', 'ok'],
  syncing: ['جاري المزامنة…', 'info'],
  offline: ['أوفلاين', 'warn'],
  error: ['خطأ في المزامنة', 'danger'],
};

export default function SyncIndicator() {
  const { syncStatus, setSyncStatus } = useApp();
  const s = syncStatus || { state: 'off' };
  const [label, tone] = LABELS[s.state] || LABELS.off;
  const title = [
    s.lastSync ? `آخر مزامنة: ${dateTime(s.lastSync)}` : 'لم تتم مزامنة بعد',
    s.pending ? `عمليات في الانتظار: ${s.pending}` : '',
    s.error || '',
  ].filter(Boolean).join('\n');

  return (
    <button
      className={`sync sync-${tone}`}
      title={title}
      onClick={() => s.state !== 'off' && api.syncNow().then(setSyncStatus).catch(() => {})}
    >
      <span className="dot" />
      <span>المزامنة: {label}</span>
      {s.state !== 'off' && s.pending > 0 && <span className="sync-pending">{s.pending}</span>}
    </button>
  );
}
