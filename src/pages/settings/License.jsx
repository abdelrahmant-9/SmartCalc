import { useState } from 'react';
import { BadgeCheck, CalendarClock, Clock, KeyRound, LockKeyhole, ShieldAlert } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { Field, Notice, Panel } from '../../components/ui.jsx';
import { ltr } from '../../lib/format.js';

const STATE = {
  off: ['بدون ترخيص', 'نظام الترخيص غير مفعّل في النسخة دي', 'muted', BadgeCheck],
  trial: ['فترة تجريبية', null, 'info', Clock],
  trial_ended: ['الفترة التجريبية انتهت', 'البرنامج للعرض فقط لحد التفعيل', 'danger', LockKeyhole],
  perpetual: ['مرخص — شراء نهائي', 'ترخيص دائم بدون تاريخ انتهاء', 'ok', BadgeCheck],
  active: ['اشتراك ساري', null, 'ok', BadgeCheck],
  expiring: ['الاشتراك قرّب ينتهي', null, 'warn', CalendarClock],
  grace: ['الاشتراك انتهى — فترة سماح', null, 'danger', ShieldAlert],
  expired: ['الاشتراك منتهي', 'البرنامج للعرض فقط لحد التجديد', 'danger', LockKeyhole],
  invalid: ['مفتاح غير صالح', null, 'danger', ShieldAlert],
};

export default function License() {
  const { license, setLicense, can, toast, refresh } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  if (!license) return null;
  const [title, fixedSub, tone, Icon] = STATE[license.state] || STATE.off;
  const sub = fixedSub || {
    trial: `باقي ${license.days} يوم (لحد ${ltr(license.trial_ends)})`,
    active: `ساري لحد ${ltr(license.expires)} — باقي ${license.days} يوم`,
    expiring: `بينتهي ${ltr(license.expires)} — باقي ${license.days} يوم`,
    grace: `انتهى ${ltr(license.expires)} — باقي ${license.grace_left} يوم قبل ما البرنامج يقف`,
    invalid: license.error,
  }[license.state];

  const activate = async () => {
    setBusy(true);
    try {
      const l = await api.activateLicense(key.trim());
      setLicense(l); setKey(''); refresh();
      toast(l.type === 'perpetual' ? 'تم التفعيل — ترخيص دائم' : `تم التفعيل — ساري لحد ${ltr(l.expires)}`);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="cols-2">
      <Panel title="حالة الترخيص">
        <div className={`license-state tone-${tone}`}>
          <Icon />
          <div><strong>{title}</strong>{sub && <span>{sub}</span>}</div>
        </div>
        {license.license && (
          <dl className="facts" style={{ marginTop: 16 }}>
            <dt>مرخص لـ</dt><dd>{license.customer || '—'}</dd>
            {license.venue && (<><dt>المكان</dt><dd>{license.venue}</dd></>)}
            <dt>النوع</dt><dd>{license.type === 'perpetual' ? 'شراء نهائي' : 'اشتراك'}{license.plan ? ` — ${license.plan}` : ''}</dd>
            {license.expires && (<><dt>ينتهي</dt><dd className="num">{license.expires}</dd></>)}
            {license.support_until && (<><dt>الدعم والتحديثات</dt><dd className="num">لحد {license.support_until}</dd></>)}
          </dl>
        )}
        <dl className="facts" style={{ marginTop: 12 }}>
          <dt>رقم الجهاز</dt><dd className="mono small">{license.device_id || '—'}</dd>
        </dl>
        {can('dev.tools') && license.license && (
          <button className="btn btn-sm btn-danger-quiet" style={{ marginTop: 12 }} onClick={() => api.removeLicense().then(setLicense).catch((e) => toast(e.message, 'error'))}>إلغاء الترخيص من الجهاز</button>
        )}
      </Panel>
      <Panel title={license.license ? 'تجديد / تغيير الترخيص' : 'تفعيل الترخيص'}>
        {license.state === 'off' ? <Notice>النسخة دي شغالة من غير نظام ترخيص.</Notice> : (
          <>
            <Field label="مفتاح الترخيص" hint="الصق المفتاح اللي وصلك من الدعم الفني (بيبدأ بـ HVN1-)">
              <textarea dir="ltr" rows={5} className="mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="HVN1-…" />
            </Field>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" disabled={busy || !key.trim()} onClick={activate}><KeyRound />تفعيل</button>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>المفتاح بيتفعّل على كل أجهزة المكان أوتوماتيك لو المزامنة شغالة.</p>
          </>
        )}
      </Panel>
    </div>
  );
}
