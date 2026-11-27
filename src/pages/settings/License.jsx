import { useState } from 'react';
import { Ban, BadgeCheck, CalendarClock, Clock, FileUp, KeyRound, LockKeyhole, RefreshCw, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { Field, Notice, Panel } from '../../components/ui.jsx';
import { dateTime, ltr } from '../../lib/format.js';

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
  suspended: ['الاشتراك موقوف', null, 'danger', Ban],
  checkin_required: ['محتاج اتصال بالإنترنت', 'وصّل الجهاز بالنت واضغط "تحقق الآن" — بياخد ثواني', 'danger', WifiOff],
};

export default function License() {
  const { license, setLicense, can, toast, refresh } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  if (!license) return null;
  const checkNow = async () => {
    setChecking(true);
    try {
      const l = await api.checkLicense(); setLicense(l); refresh();
      toast(l.changed ? 'تم التحقق — وصل تحديث للترخيص' : 'تم التحقق من الاشتراك');
    } catch (e) { toast(e.message, 'error'); }
    setChecking(false);
  };
  const fromFile = async () => {
    try { const l = await api.activateLicenseFile(); if (l) { setLicense(l); refresh(); toast('تم التفعيل من الملف'); } } catch (e) { toast(e.message, 'error'); }
  };
  const [title, fixedSub, tone, Icon] = STATE[license.state] || STATE.off;
  const sub = fixedSub || {
    trial: `باقي ${license.days} يوم (لحد ${ltr(license.trial_ends)})`,
    active: `ساري لحد ${ltr(license.expires)} — باقي ${license.days} يوم`,
    expiring: `بينتهي ${ltr(license.expires)} — باقي ${license.days} يوم`,
    grace: `انتهى ${ltr(license.expires)} — باقي ${license.grace_left} يوم قبل ما البرنامج يقف`,
    invalid: license.error,
    suspended: `اتوقف من الدعم الفني${license.reason ? ` — ${license.reason}` : ''}. البيانات موجودة وتقدر تشوفها، والتسجيل هيرجع أول ما يتشغل.`,
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
          <dt>آخر تحقق أونلاين</dt><dd className="num">{license.last_online ? dateTime(license.last_online) : 'لسه'}</dd>
          {license.offline && (<><dt>لازم يتصل بالنت</dt><dd>{license.offline.left_days > 0 ? `خلال ${license.offline.left_days} يوم` : 'دلوقتي'} <span className="muted small">(مرة كل {license.offline.days} يوم على الأقل)</span></dd></>)}
          <dt>رقم الجهاز</dt><dd className="mono small">{license.device_id || '—'}</dd>
        </dl>
        {license.state !== 'off' && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className={`btn ${license.state === 'checkin_required' ? 'btn-primary' : ''}`} disabled={checking} onClick={checkNow}>{checking ? <RefreshCw className="spin" /> : <Wifi />}تحقق الآن</button>
          </div>
        )}
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
              <button className="btn" onClick={fromFile}><FileUp />تفعيل من ملف</button>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              الجهاز مفيهوش نت؟ خد ملف المفتاح (.hvnkey) على فلاشة واضغط "تفعيل من ملف".
              ولو الجهاز متصل بالنت، التجديد بيوصل لوحده من غير ما تلصق حاجة.
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
