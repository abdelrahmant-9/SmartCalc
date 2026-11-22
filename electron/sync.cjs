// Online sync with a Supabase project (Postgres + REST). The app works fully offline;
// whenever the internet is available, local changes are pushed and remote changes pulled.
// Conflict rule: last write wins, by `updated_at`.
const crypto = require('node:crypto');

const PULL_LIMIT = 1000;
const PUSH_BATCH = 300;
const PULL_OVERLAP = 200; // re-read a few rows to cover transactions that committed out of order
const INTERVAL_MS = 20000;

class Sync {
  constructor(store, { onChange, onStatus } = {}) {
    this.store = store;
    this.onChange = onChange || (() => {});
    this.onStatus = onStatus || (() => {});
    this.running = false;
    this.timer = null;
    this.debounce = null;
    this.session = null;
    this.status = { state: 'off', lastSync: store.getKV('sync_last', null), error: null, pending: 0 };
    if (!store.getKV('device_id')) store.setKV('device_id', crypto.randomUUID());
  }

  config() {
    return this.store.getKV('sync_config', { enabled: false, url: '', anonKey: '', email: '', password: '' });
  }

  setConfig(cfg) {
    const prev = this.config();
    const next = {
      enabled: !!cfg.enabled,
      url: String(cfg.url || '').trim().replace(/\/+$/, ''),
      anonKey: String(cfg.anonKey || '').trim(),
      email: String(cfg.email || '').trim(),
      password: cfg.password ? String(cfg.password) : prev.password,
    };
    // A different project means a fresh pull from the beginning.
    if (next.url !== prev.url) this.store.setKV('sync_cursor', 0);
    this.store.setKV('sync_config', next);
    this.session = null;
    this.start();
    return this.publicConfig();
  }

  publicConfig() {
    const c = this.config();
    return { enabled: c.enabled, url: c.url, anonKey: c.anonKey, email: c.email, hasPassword: !!c.password };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch, pending: this.store.pendingCount() };
    this.onStatus(this.status);
  }

  getStatus() {
    return { ...this.status, pending: this.store.pendingCount() };
  }

  start() {
    clearInterval(this.timer);
    const c = this.config();
    if (!c.enabled || !c.url || !c.anonKey) { this.setStatus({ state: 'off', error: null }); return; }
    this.setStatus({ state: 'idle', error: null });
    this.timer = setInterval(() => this.run(), INTERVAL_MS);
    this.run();
  }

  stop() { clearInterval(this.timer); clearTimeout(this.debounce); }

  // Called after every local write: sync soon, batching bursts of writes.
  nudge() {
    if (!this.config().enabled) { this.setStatus({}); return; }
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.run(), 1500);
  }

  async request(path, { method = 'GET', body, auth = true } = {}) {
    const c = this.config();
    const headers = { apikey: c.anonKey, 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Bearer ${this.session.access_token}`;
    const res = await fetch(`${c.url}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error_description || data.msg || data.error)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async ensureSession() {
    const c = this.config();
    const now = Date.now() / 1000;
    if (this.session && this.session.expires_at - 60 > now) return;
    if (this.session?.refresh_token) {
      try {
        this.session = await this.request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', auth: false, body: { refresh_token: this.session.refresh_token },
        });
        return;
      } catch { this.session = null; }
    }
    if (!c.email || !c.password) throw new Error('بيانات حساب المزامنة غير مكتملة');
    this.session = await this.request('/auth/v1/token?grant_type=password', {
      method: 'POST', auth: false, body: { email: c.email, password: c.password },
    });
  }

  async run() {
    if (this.running) return;
    const c = this.config();
    if (!c.enabled || !c.url || !c.anonKey) return;
    this.running = true;
    this.setStatus({ state: 'syncing' });
    try {
      await this.ensureSession();
      const deviceId = this.store.getKV('device_id');

      // Push local changes.
      for (;;) {
        const rows = this.store.dirtyRows(PUSH_BATCH);
        if (!rows.length) break;
        await this.request('/rest/v1/rpc/push_records', {
          method: 'POST',
          body: { rows: rows.map((r) => ({ ...r, device_id: deviceId })) },
        });
        this.store.markClean(rows);
        if (rows.length < PUSH_BATCH) break;
      }

      // Pull remote changes.
      let cursor = Number(this.store.getKV('sync_cursor', 0));
      let from = Math.max(0, cursor - PULL_OVERLAP);
      let changed = 0;
      for (;;) {
        const rows = await this.request(
          `/rest/v1/records?select=tbl,id,data,updated_at,deleted,server_seq&server_seq=gt.${from}&order=server_seq.asc&limit=${PULL_LIMIT}`,
        );
        if (!rows.length) break;
        changed += this.store.applyRemote(rows);
        from = Number(rows[rows.length - 1].server_seq);
        cursor = Math.max(cursor, from);
        if (rows.length < PULL_LIMIT) break;
      }
      this.store.setKV('sync_cursor', cursor);
      const lastSync = Date.now();
      this.store.setKV('sync_last', lastSync);
      this.setStatus({ state: 'idle', lastSync, error: null });
      if (changed) this.onChange();
    } catch (e) {
      if (e.status === 401) this.session = null;
      const offline = !e.status && /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout|aborted|EAI_AGAIN/i.test(`${e.message} ${e.cause?.code || ''}`);
      this.setStatus({ state: offline ? 'offline' : 'error', error: offline ? 'لا يوجد اتصال بالإنترنت' : e.message });
    } finally {
      this.running = false;
    }
  }
}

module.exports = { Sync };
