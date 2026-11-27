// Signed license keys (Ed25519). The vendor app signs with a private key that never leaves
// the developer's machine; client apps only hold the public key, so a key can't be forged or edited.
//
// Key format:  HVN1-<base64url(payload JSON)>.<base64url(signature)>
// Payload:     { lid, cid, customer, venue, type: 'subscription'|'perpetual', plan, expires (YYYY-MM-DD|null),
//               support_until (YYYY-MM-DD|null), issued (ms) }
const crypto = require('node:crypto');

const PREFIX = 'HVN1-';
const TRIAL_DAYS = 14;
const GRACE_DAYS = 5;
const WARN_DAYS = 7;

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function signLicense(payload, privateKeyPem) {
  const body = b64u(JSON.stringify({ ...payload, issued: payload.issued || Date.now() }));
  const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(privateKeyPem));
  return `${PREFIX}${body}.${b64u(sig)}`;
}

// Returns the payload, or throws with an Arabic message.
function verifyLicense(key, publicKeyPem) {
  const clean = String(key || '').replace(/\s+/g, '');
  if (!clean.startsWith(PREFIX)) throw new Error('مفتاح الترخيص غير صحيح');
  const [body, sig] = clean.slice(PREFIX.length).split('.');
  if (!body || !sig) throw new Error('مفتاح الترخيص ناقص — انسخه كامل');
  let ok = false;
  try { ok = crypto.verify(null, Buffer.from(body), crypto.createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url')); } catch { ok = false; }
  if (!ok) throw new Error('مفتاح الترخيص غير صالح أو اتعدّل');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

const dayMs = 86400000;
const dateOnly = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Whole calendar days from today to the end date (0 = it ends today, negative = already over).
const daysUntil = (iso, nowMs) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${dateOnly(nowMs)}T00:00:00`).getTime()) / dayMs);

// ---------- signed status (suspend / resume from the vendor) ----------
const STATUS_PREFIX = 'HVS1-';
function signStatus(status, privateKeyPem) {
  const body = b64u(JSON.stringify({ ...status, at: status.at || Date.now() }));
  return `${STATUS_PREFIX}${body}.${b64u(crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(privateKeyPem)))}`;
}
function verifyStatus(token, publicKeyPem) {
  const t = String(token || '');
  if (!t.startsWith(STATUS_PREFIX)) return null;
  const [body, sig] = t.slice(STATUS_PREFIX.length).split('.');
  try {
    if (!crypto.verify(null, Buffer.from(body), crypto.createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url'))) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch { return null; }
}

// How long a device may run without reaching the internet. Measured two ways so that freezing the
// computer clock does not help: calendar days since the last online check, and hours the app has
// actually been running (a monotonic count the wall clock can't change).
const HOURS_PER_DAY = 10;
const DEFAULT_OFFLINE_DAYS = { subscription: 14, perpetual: 0 };
function allowance(p, checkin, now) {
  const days = p.offline_days ?? DEFAULT_OFFLINE_DAYS[p.type] ?? 0;
  if (!days) return null;
  const sinceDays = Math.max(0, (now - (checkin?.last || 0)) / dayMs);
  const hours = (checkin?.uptime || 0) / 3600000;
  const used = Math.max(sinceDays / days, hours / (days * HOURS_PER_DAY));
  const leftDays = Math.max(0, Math.ceil(days * (1 - used)));
  return { days, used, left_days: leftDays, last_check: checkin?.last || null };
}

/**
 * Works out what the app may do right now.
 * state: 'off' (no public key built in: licensing disabled) | 'trial' | 'trial_ended' | 'invalid' |
 *        'suspended' | 'checkin_required' | 'perpetual' | 'active' | 'expiring' | 'grace' | 'expired'
 * writable: false means read-only mode.
 */
function evaluate({ publicKey, key, firstRun, now, status = null, checkin = null, uptimeTotal = 0 }) {
  if (!publicKey) return { state: 'off', writable: true };
  if (key) {
    let p;
    try { p = verifyLicense(key, publicKey); } catch (e) { return { state: 'invalid', writable: false, error: e.message }; }
    const base = { license: p, customer: p.customer, venue: p.venue, type: p.type, plan: p.plan, expires: p.expires, support_until: p.support_until };
    // A suspension applies to keys issued before it; a key issued later (e.g. after paying) lifts it.
    if (status && status.cid === p.cid && status.revoked && status.at >= (p.issued || 0)) {
      return { ...base, state: 'suspended', writable: false, reason: status.reason || '' };
    }
    let st;
    if (p.type === 'perpetual') st = { ...base, state: 'perpetual', writable: true };
    else {
      const days = daysUntil(p.expires, now);
      if (days > WARN_DAYS) st = { ...base, state: 'active', writable: true, days };
      else if (days >= 0) st = { ...base, state: 'expiring', writable: true, days };
      else if (days >= -GRACE_DAYS) st = { ...base, state: 'grace', writable: true, days, grace_left: GRACE_DAYS + days };
      else return { ...base, state: 'expired', writable: false, days };
    }
    const a = allowance(p, checkin, now);
    if (a) {
      st.offline = a;
      if (a.used >= 1) return { ...st, state: 'checkin_required', writable: false, previous: st.state };
    }
    return st;
  }
  // The trial also ends after 14 × 10 hours of real use, whatever the calendar says.
  const byDays = Math.floor((now - firstRun) / dayMs);
  const byHours = Math.floor(uptimeTotal / 3600000 / HOURS_PER_DAY);
  const left = TRIAL_DAYS - Math.max(byDays, byHours);
  if (left > 0) return { state: 'trial', writable: true, days: left, trial_ends: dateOnly(firstRun + TRIAL_DAYS * dayMs) };
  return { state: 'trial_ended', writable: false, days: left };
}

module.exports = {
  PREFIX, STATUS_PREFIX, TRIAL_DAYS, GRACE_DAYS, WARN_DAYS, HOURS_PER_DAY, DEFAULT_OFFLINE_DAYS,
  generateKeyPair, signLicense, verifyLicense, signStatus, verifyStatus, evaluate, dateOnly,
};
