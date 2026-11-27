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

/**
 * Works out what the app may do right now.
 * state: 'off' (no public key built in: licensing disabled) | 'trial' | 'trial_ended' |
 *        'perpetual' | 'active' | 'expiring' | 'grace' | 'expired'
 * writable: false means read-only mode.
 */
function evaluate({ publicKey, key, firstRun, now }) {
  if (!publicKey) return { state: 'off', writable: true };
  if (key) {
    let p;
    try { p = verifyLicense(key, publicKey); } catch (e) { return { state: 'invalid', writable: false, error: e.message }; }
    const base = { license: p, customer: p.customer, venue: p.venue, type: p.type, plan: p.plan, expires: p.expires, support_until: p.support_until };
    if (p.type === 'perpetual') return { ...base, state: 'perpetual', writable: true };
    const days = daysUntil(p.expires, now);
    if (days > WARN_DAYS) return { ...base, state: 'active', writable: true, days };
    if (days >= 0) return { ...base, state: 'expiring', writable: true, days };
    if (days >= -GRACE_DAYS) return { ...base, state: 'grace', writable: true, days, grace_left: GRACE_DAYS + days };
    return { ...base, state: 'expired', writable: false, days };
  }
  const left = TRIAL_DAYS - Math.floor((now - firstRun) / dayMs);
  if (left > 0) return { state: 'trial', writable: true, days: left, trial_ends: dateOnly(firstRun + TRIAL_DAYS * dayMs) };
  return { state: 'trial_ended', writable: false, days: left };
}

module.exports = { PREFIX, TRIAL_DAYS, GRACE_DAYS, WARN_DAYS, generateKeyPair, signLicense, verifyLicense, evaluate, dateOnly };
