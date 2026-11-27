import { Fragment, useEffect, useState } from 'react';
import { Bug, Database, Download, FolderOpen, RefreshCw, RotateCcw, UploadCloud, Wrench } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { dateTime, num } from '../../lib/format.js';
import { Confirm, Notice, Panel } from '../../components/ui.jsx';

const ACTIONS = [
  { id: 'devtools', icon: Bug, label: 'فتح DevTools', desc: 'Console و Network لتتبع الأخطاء' },
  { id: 'reload', icon: RefreshCw, label: 'إعادة تحميل الواجهة', desc: 'من غير ما تقفل البرنامج' },
  { id: 'open-data', icon: FolderOpen, label: 'فتح فولدر البيانات', desc: 'قاعدة البيانات والإعدادات المحلية' },
  { id: 'resync-pull', icon: RotateCcw, label: 'إعادة سحب كل البيانات', desc: 'يسحب كل السجلات من السيرفر من الأول', confirm: 'هيتم سحب كل السجلات من سيرفر المزامنة ودمجها. متابعة؟' },
  { id: 'resync-push', icon: UploadCloud, label: 'إعادة رفع كل البيانات', desc: 'يعلّم كل السجلات المحلية للرفع تاني', confirm: 'هيتم رفع كل سجلات الجهاز ده للسيرفر (الأحدث يكسب). متابعة؟' },
  { id: 'vacuum', icon: Database, label: 'ضغط قاعدة البيانات', desc: 'VACUUM — يقلل حجم الملف' },
];

const bytes = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function Developer() {
  const { toast } = useApp();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const load = () => api.devInfo().then(setInfo).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (a) => {
    setBusy(a.id);
    try {
      const msg = await api.devAction(a.id);
      if (msg !== 'reload') toast(msg);
      await load();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(null);
  };

  const exportDiag = async () => {
    const content = JSON.stringify({ exported_at: new Date().toISOString(), ...info }, null, 2);
    try { const p = await api.saveFile({ defaultPath: `heaven-diagnostics-${Date.now()}.json`, content, filters: [{ name: 'JSON', extensions: ['json'] }] }); if (p) toast('تم حفظ ملف التشخيص'); } catch (e) { toast(e.message, 'error'); }
  };

  if (!info) return null;
  const total = info.byTable.reduce((a, r) => a + r.live, 0);
  const facts = [
    ['إصدار البرنامج', info.version], ['Electron', info.electron], ['Node', info.node], ['Chromium', info.chrome], ['SQLite', info.sqlite],
    ['النظام', info.platform], ['حجم قاعدة البيانات', bytes(info.bytes)], ['معرف الجهاز', info.deviceId],
    ['مؤشر المزامنة', num(info.syncCursor)], ['حالة المزامنة', `${info.sync.state}${info.sync.error ? ` — ${info.sync.error}` : ''}`],
    ['آخر مزامنة', info.sync.lastSync ? dateTime(info.sync.lastSync) : '—'], ['في انتظار الرفع', num(info.sync.pending)],
  ];

  return (
    <>
      <Notice icon={Wrench}>أدوات المطور — الصلاحية دي لحساب الدعم الفني بس، وإدارة المكان تقدر توقفه من المستخدمين.</Notice>
      <div className="cols-2">
        <Panel title="معلومات النظام" actions={<button className="btn btn-sm" onClick={exportDiag}><Download />تصدير التشخيص</button>}>
          <dl className="facts">
            {facts.map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd className={/[a-z0-9]/i.test(String(v)) ? 'mono' : ''}>{v}</dd></Fragment>))}
            <dt>مكان البيانات</dt><dd className="mono small" style={{ wordBreak: 'break-all' }}>{info.dataPath}</dd>
          </dl>
        </Panel>
        <Panel body={false} title="السجلات" meta={`${num(total)} سجل`}>
          <table className="table compact">
            <thead><tr><th>الجدول</th><th className="end">فعّال</th><th className="end">محذوف</th><th className="end">لم يُرفع</th></tr></thead>
            <tbody>
              {info.byTable.map((r) => (
                <tr key={r.tbl}><td className="mono">{r.tbl}</td><td className="end num">{num(r.live)}</td><td className="end num muted">{num(r.deleted)}</td><td className={`end num ${r.dirty ? 'text-warn' : 'muted'}`}>{num(r.dirty)}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      <Panel title="الصيانة">
        <div className="dev-actions">
          {ACTIONS.map((a) => (
            <button key={a.id} className="dev-action" disabled={!!busy} onClick={() => (a.confirm ? setConfirm(a) : run(a))}>
              <a.icon /><span><strong>{busy === a.id ? 'جاري التنفيذ…' : a.label}</strong><small>{a.desc}</small></span>
            </button>
          ))}
        </div>
      </Panel>
      {confirm && <Confirm title={confirm.label} danger={false} confirmText="تنفيذ" message={confirm.confirm} onClose={() => setConfirm(null)} onConfirm={() => run(confirm)} />}
    </>
  );
}
