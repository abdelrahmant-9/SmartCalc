const test = require('node:test');
const assert = require('node:assert');
const L = require('../electron/license.cjs');
const { Store } = require('../electron/store.cjs');
const { Service } = require('../electron/service.cjs');

const keys = L.generateKeyPair();
const DAY = 86400000;
const T0 = new Date('2026-12-01T10:00:00').getTime();
const iso = (ms) => L.dateOnly(ms);

function mk(nowRef) {
  const store = new Store(':memory:');
  const svc = new Service(store, { publicKey: keys.publicKey, now: () => nowRef.t });
  svc.login('admin', 'admin');
  return { store, svc };
}

test('keys are signed: a forged or edited key is rejected', () => {
  const key = L.signLicense({ cid: 'c1', customer: 'Heaven', type: 'subscription', expires: '2027-01-01' }, keys.privateKey);
  assert.equal(L.verifyLicense(key, keys.publicKey).customer, 'Heaven');
  const [body, sig] = key.slice(5).split('.');
  const edited = JSON.parse(Buffer.from(body, 'base64url'));
  edited.expires = '2099-01-01';
  const tampered = `HVN1-${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${sig}`;
  assert.throws(() => L.verifyLicense(tampered, keys.publicKey), /غير صالح/);
  const other = L.generateKeyPair();
  assert.throws(() => L.verifyLicense(L.signLicense({ type: 'perpetual' }, other.privateKey), keys.publicKey), /غير صالح/);
  assert.throws(() => L.verifyLicense('hello', keys.publicKey), /غير صحيح/);
});

test('no public key built in: licensing is off', () => {
  const svc = new Service(new Store(':memory:'), { publicKey: null });
  assert.equal(svc.license().state, 'off');
});

test('trial, then read-only, then activation unlocks', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  assert.equal(svc.license().state, 'trial');
  assert.equal(svc.license().days, 14);
  assert.ok(svc.put('bookings', { bride_name: 'x' }));
  now.t = T0 + 15 * DAY;
  assert.equal(svc.license().state, 'trial_ended');
  assert.throws(() => svc.put('bookings', { bride_name: 'y' }), /التجريبية/);
  assert.ok(svc.list('bookings').length === 1, 'reading still works');
  const key = L.signLicense({ cid: 'c1', customer: 'Heaven', type: 'perpetual' }, keys.privateKey);
  assert.equal(svc.activateLicense(key).state, 'perpetual');
  assert.ok(svc.put('bookings', { bride_name: 'z' }));
});

test('subscription: active, expiring, grace, expired, renewed', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.activateLicense(L.signLicense({ type: 'subscription', customer: 'X', expires: iso(T0 + 30 * DAY) }, keys.privateKey));
  assert.equal(svc.license().state, 'active');
  now.t = T0 + 25 * DAY; assert.equal(svc.license().state, 'expiring');
  now.t = T0 + 33 * DAY; assert.equal(svc.license().state, 'grace');
  assert.ok(svc.put('ticket_sales', { total: 100 }), 'grace still writable');
  now.t = T0 + 40 * DAY; assert.equal(svc.license().state, 'expired');
  assert.throws(() => svc.put('ticket_sales', { total: 100 }), /منتهي/);
  // Renewing works even while read-only.
  svc.activateLicense(L.signLicense({ type: 'subscription', customer: 'X', expires: iso(T0 + 70 * DAY) }, keys.privateKey));
  assert.equal(svc.license().state, 'active');
});

test('turning the clock back does not extend the subscription', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.activateLicense(L.signLicense({ type: 'subscription', expires: iso(T0 + 10 * DAY) }, keys.privateKey));
  now.t = T0 + 20 * DAY; assert.equal(svc.license().state, 'expired');
  now.t = T0; // user sets the computer date back
  assert.equal(svc.license().state, 'expired');
});

test('only admins can activate; nobody can write the license row directly', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.saveUser({ name: 'سارة', username: 'sara', password: '1234', role: 'employee' });
  svc.logout(); svc.login('sara', '1234');
  assert.throws(() => svc.activateLicense(L.signLicense({ type: 'perpetual' }, keys.privateKey)), /صلاحية/);
  svc.logout(); svc.login('admin', 'admin');
  assert.throws(() => svc.put('settings', { id: 'license', key: 'HVN1-x.y' }), /الترخيص/);
});
