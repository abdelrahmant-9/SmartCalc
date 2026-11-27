const test = require('node:test');
const assert = require('node:assert');
const L = require('../electron/license.cjs');
const { Store } = require('../electron/store.cjs');
const { Service } = require('../electron/service.cjs');

const keys = L.generateKeyPair();
const DAY = 86400000;
const T0 = new Date('2031-12-01T10:00:00').getTime(); // far enough ahead that real record timestamps never pass it
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
  assert.throws(() => svc.activateLicense(key), /بالفعل/, 'the same key cannot be re-entered to reset counters');
  assert.ok(svc.put('bookings', { bride_name: 'z' }));
});

test('subscription: active, expiring, grace, expired, renewed', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.activateLicense(L.signLicense({ cid: 'x', type: 'subscription', customer: 'X', expires: iso(T0 + 30 * DAY), offline_days: 0 }, keys.privateKey));
  assert.equal(svc.license().state, 'active');
  now.t = T0 + 25 * DAY; assert.equal(svc.license().state, 'expiring');
  now.t = T0 + 33 * DAY; assert.equal(svc.license().state, 'grace');
  assert.ok(svc.put('ticket_sales', { total: 100 }), 'grace still writable');
  now.t = T0 + 40 * DAY; assert.equal(svc.license().state, 'expired');
  assert.throws(() => svc.put('ticket_sales', { total: 100 }), /منتهي/);
  // Renewing works even while read-only.
  svc.activateLicense(L.signLicense({ cid: 'x', type: 'subscription', customer: 'X', expires: iso(T0 + 70 * DAY), offline_days: 0, issued: Date.now() + 1000 }, keys.privateKey));
  assert.equal(svc.license().state, 'active');
});

test('turning the clock back does not extend the subscription', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.activateLicense(L.signLicense({ type: 'subscription', expires: iso(T0 + 10 * DAY), offline_days: 0 }, keys.privateKey));
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

test('frozen clock: running hours still use up the offline allowance', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.activateLicense(L.signLicense({ cid: 'c', type: 'subscription', expires: iso(T0 + 365 * DAY), offline_days: 14 }, keys.privateKey));
  assert.equal(svc.license().state, 'active');
  // The customer freezes the date at T0 and keeps working: 100 running hours, then 140.
  svc.tick(100 * 3600000);
  assert.equal(svc.license().state, 'active');
  assert.ok(svc.license().offline.left_days <= 5);
  svc.tick(40 * 3600000);
  assert.equal(svc.license().state, 'checkin_required');
  assert.throws(() => svc.put('bookings', { bride_name: 'x' }), /الإنترنت/);
  // One connection to the internet clears it.
  svc.recordOnline({ serverTime: T0 + 6 * DAY });
  assert.equal(svc.license().state, 'active');
});

test('real calendar days also count, and online time beats a wrong local clock', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.activateLicense(L.signLicense({ cid: 'c', type: 'subscription', expires: iso(T0 + 20 * DAY), offline_days: 14 }, keys.privateKey));
  now.t = T0 + 15 * DAY;
  assert.equal(svc.license().state, 'checkin_required');
  // Local clock set back to T0, but the internet says it is really day 25: the subscription is over.
  now.t = T0;
  svc.recordOnline({ serverTime: T0 + 26 * DAY });
  assert.equal(svc.license().state, 'expired');
});

test('saved records put a floor under the clock', () => {
  const now = { t: T0 };
  const { svc, store } = mk(now);
  svc.activateLicense(L.signLicense({ cid: 'c', type: 'subscription', expires: iso(T0 + 10 * DAY), offline_days: 0 }, keys.privateKey));
  // A record written on another device at day 20 arrives by sync.
  store.applyRemote([{ tbl: 'bookings', id: 'r1', data: { id: 'r1' }, updated_at: T0 + 20 * DAY, deleted: false }]);
  svc.refreshClockFloor();
  assert.equal(svc.license().state, 'expired');
});

test('vendor can suspend and resume; forged statuses are ignored', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  const key = L.signLicense({ cid: 'venue-1', type: 'perpetual', issued: T0 - DAY }, keys.privateKey);
  svc.activateLicense(key);
  const other = L.generateKeyPair();
  svc.recordOnline({ serverTime: T0, status: L.signStatus({ cid: 'venue-1', revoked: true, at: T0 }, other.privateKey) });
  assert.equal(svc.license().state, 'perpetual', 'status signed by someone else is ignored');
  svc.recordOnline({ serverTime: T0, status: L.signStatus({ cid: 'venue-1', revoked: true, reason: 'متأخرات', at: T0 }, keys.privateKey) });
  assert.equal(svc.license().state, 'suspended');
  assert.throws(() => svc.put('ticket_sales', { total: 1 }), /موقوف/);
  // An older "active" status replayed later doesn't undo the suspension.
  svc.recordOnline({ serverTime: T0, status: L.signStatus({ cid: 'venue-1', revoked: false, at: T0 - 1000 }, keys.privateKey) });
  assert.equal(svc.license().state, 'suspended');
  svc.recordOnline({ serverTime: T0 + DAY, status: L.signStatus({ cid: 'venue-1', revoked: false, at: T0 + DAY }, keys.privateKey) });
  assert.equal(svc.license().state, 'perpetual');
});

test('renewal arrives online by itself; keys for another customer are ignored', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  svc.activateLicense(L.signLicense({ cid: 'venue-1', type: 'subscription', expires: iso(T0 + 3 * DAY), issued: T0 - DAY }, keys.privateKey));
  assert.equal(svc.license().state, 'expiring');
  svc.recordOnline({ serverTime: T0, key: L.signLicense({ cid: 'other', type: 'perpetual', issued: T0 }, keys.privateKey) });
  assert.equal(svc.license().state, 'expiring');
  const r = svc.recordOnline({ serverTime: T0, key: L.signLicense({ cid: 'venue-1', type: 'subscription', expires: iso(T0 + 40 * DAY), issued: T0 }, keys.privateKey) });
  assert.ok(r.changed);
  assert.equal(svc.license().state, 'active');
});

test('trial ends after 140 running hours even with a frozen date', () => {
  const now = { t: T0 };
  const { svc } = mk(now);
  assert.equal(svc.license().state, 'trial');
  svc.tick(141 * 3600000);
  assert.equal(svc.license().state, 'trial_ended');
});

test('online check talks to the license server and reads its time', async () => {
  const http = require('node:http');
  const { checkOnline } = require('../electron/license-online.cjs');
  const status = L.signStatus({ cid: 'v1', revoked: true, at: 1 }, keys.privateKey);
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      assert.equal(req.url, '/rest/v1/rpc/license_status');
      assert.equal(JSON.parse(body).p_cid, 'v1');
      res.writeHead(200, { 'Content-Type': 'application/json', Date: 'Wed, 01 Jan 2031 10:00:00 GMT' });
      res.end(JSON.stringify([{ key: 'HVN1-a.b', status }]));
    });
  });
  await new Promise((r) => srv.listen(0, r));
  try {
    const r = await checkOnline({ server: { url: `http://127.0.0.1:${srv.address().port}`, anonKey: 'anon' }, cid: 'v1' });
    assert.equal(r.serverTime, Date.parse('Wed, 01 Jan 2031 10:00:00 GMT'));
    assert.equal(r.key, 'HVN1-a.b');
    assert.equal(r.status, status);
  } finally { srv.close(); }
});
