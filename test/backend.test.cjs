const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Store } = require('../electron/store.cjs');
const { Service } = require('../electron/service.cjs');
const { Sync } = require('../electron/sync.cjs');

const mk = () => { const store = new Store(':memory:'); return { store, svc: new Service(store) }; };

test('seeds default admin and logs in', () => {
  const { svc } = mk();
  assert.throws(() => svc.login('admin', 'wrong'), /غير صحيحة/);
  const u = svc.login('admin', 'admin');
  assert.equal(u.role, 'admin');
  assert.equal(u.password_hash, undefined, 'hash must never leave the main process');
});

test('employee permissions', () => {
  const { svc } = mk();
  svc.login('admin', 'admin');
  svc.saveUser({ name: 'سارة', username: 'sara', password: '1234', role: 'employee' });
  svc.logout();
  svc.login('sara', '1234');
  assert.throws(() => svc.put('ticket_types', { name: 'x', price: 1 }), /للمدير فقط/);
  assert.throws(() => svc.remove('bookings', 'any'), /للمدير فقط/);
  const pay = svc.put('payments', { booking_id: 'b1', amount: 500, date: '2026-11-21' });
  assert.throws(() => svc.put('payments', { ...pay, amount: 1 }), /لا يمكن تعديل/);
  const b = svc.put('bookings', { bride_name: 'منى', date: '2026-11-21' });
  assert.ok(svc.put('bookings', { ...b, status: 'completed' }));
  assert.ok(svc.list('users').every((u) => u.password_hash === undefined));
});

test('admin can block employee expenses', () => {
  const { svc } = mk();
  svc.login('admin', 'admin');
  svc.put('settings', { ...svc.settings(), allowEmployeeExpenses: false });
  svc.saveUser({ name: 'علي', username: 'ali', password: '1234', role: 'employee' });
  svc.logout();
  svc.login('ali', '1234');
  assert.throws(() => svc.put('transactions', { type: 'out', amount: 10 }), /غير مسموح/);
});

test('date range filtering', () => {
  const { svc } = mk();
  svc.login('admin', 'admin');
  ['2026-11-01', '2026-11-15', '2026-12-01'].forEach((date) => svc.put('ticket_sales', { date, total: 100 }));
  assert.equal(svc.list('ticket_sales', { field: 'date', from: '2026-11-01', to: '2026-11-30' }).length, 2);
  assert.equal(svc.list('ticket_sales', { field: 'date', equals: '2026-12-01' }).length, 1);
  assert.throws(() => svc.list('ticket_sales', { field: "date') OR 1=1 --" }), /غير صالح/);
});

test('last write wins on remote apply', () => {
  const { store, svc } = mk();
  svc.login('admin', 'admin');
  const b = svc.put('bookings', { bride_name: 'local' });
  const local = store.get('bookings', b.id);
  assert.equal(store.applyRemote([{ tbl: 'bookings', id: b.id, data: { ...local, bride_name: 'old' }, updated_at: local.updated_at - 10, deleted: false }]), 0);
  assert.equal(store.get('bookings', b.id).bride_name, 'local');
  store.applyRemote([{ tbl: 'bookings', id: b.id, data: { ...local, bride_name: 'newer' }, updated_at: local.updated_at + 10, deleted: false }]);
  assert.equal(store.get('bookings', b.id).bride_name, 'newer');
});

// Minimal fake of the Supabase endpoints the app uses.
function fakeSupabase() {
  const rows = new Map();
  let seq = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.url.startsWith('/auth/v1/token')) return send(200, { access_token: 't', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 });
      if (req.headers.authorization !== 'Bearer t') return send(401, { message: 'unauthorized' });
      if (req.url === '/rest/v1/rpc/push_records') {
        for (const r of JSON.parse(body).rows) {
          const k = `${r.tbl}/${r.id}`;
          const cur = rows.get(k);
          if (!cur || cur.updated_at < r.updated_at) rows.set(k, { ...r, server_seq: ++seq });
        }
        return send(200, null);
      }
      if (req.url.startsWith('/rest/v1/records')) {
        const u = new URL(req.url, 'http://x');
        const gt = Number(u.searchParams.get('server_seq').slice(3));
        const limit = Number(u.searchParams.get('limit'));
        return send(200, [...rows.values()].filter((r) => r.server_seq > gt).sort((a, b) => a.server_seq - b.server_seq).slice(0, limit));
      }
      return send(404, {});
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

test('two devices sync through the server', async () => {
  const { server, url } = await fakeSupabase();
  try {
    const a = mk(); const b = mk();
    const cfg = { enabled: true, url, anonKey: 'k', email: 'e@x.com', password: 'p' };
    const syncA = new Sync(a.store); const syncB = new Sync(b.store);
    a.store.setKV('sync_config', cfg); b.store.setKV('sync_config', cfg);

    a.svc.login('admin', 'admin');
    a.svc.changePassword('admin', 'secret');
    const booking = a.svc.put('bookings', { bride_name: 'ريم', date: '2026-11-22', total: 2000 });
    a.svc.put('payments', { booking_id: booking.id, amount: 500, date: '2026-11-21' });
    await syncA.run();
    assert.equal(syncA.getStatus().state, 'idle', syncA.getStatus().error);
    assert.equal(a.store.pendingCount(), 0);

    await syncB.run();
    assert.equal(b.store.get('bookings', booking.id).bride_name, 'ريم');
    // The changed admin password reached device B, and the seeded default did not overwrite it.
    assert.throws(() => b.svc.login('admin', 'admin'));
    assert.ok(b.svc.login('admin', 'secret'));
    assert.equal(b.svc.list('payments').length, 1);

    // Edit on B, delete on A later -> delete wins (newer).
    b.svc.put('bookings', { ...b.store.get('bookings', booking.id), status: 'completed' });
    await syncB.run();
    await syncA.run();
    assert.equal(a.store.get('bookings', booking.id).status, 'completed');
    a.svc.remove('bookings', booking.id);
    await syncA.run();
    await syncB.run();
    assert.equal(b.store.get('bookings', booking.id), null);
    syncA.stop(); syncB.stop();
  } finally {
    server.close();
  }
});

test('sync reports offline without crashing', async () => {
  const { store } = mk();
  const s = new Sync(store);
  store.setKV('sync_config', { enabled: true, url: 'http://127.0.0.1:1', anonKey: 'k', email: 'e', password: 'p' });
  await s.run();
  assert.equal(s.getStatus().state, 'offline');
});
