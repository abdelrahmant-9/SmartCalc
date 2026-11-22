// Local offline-first storage on top of the SQLite engine built into Electron (node:sqlite).
// Every entity is stored as a JSON document in a single `records` table, keyed by (tbl, id).
// Rows carry `updated_at` (ms) for last-write-wins merging and a `dirty` flag for sync.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const TABLES = [
  'users', 'settings', 'packages', 'extras', 'ticket_types', 'cafe_items',
  'bookings', 'payments', 'ticket_sales', 'cafe_orders', 'transactions',
];
const FIELD_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertTable(tbl) {
  if (!TABLES.includes(tbl)) throw new Error(`جدول غير معروف: ${tbl}`);
}

class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS records (
        tbl TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        dirty INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (tbl, id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_tbl ON records (tbl, deleted);
      CREATE INDEX IF NOT EXISTS idx_records_dirty ON records (dirty);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
    `);
  }

  // ---------- local key/value (never synced) ----------
  getKV(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  setKV(key, value) {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  // ---------- reads ----------
  list(tbl, opts = {}) {
    assertTable(tbl);
    let sql = 'SELECT data FROM records WHERE tbl = ? AND deleted = 0';
    const params = [tbl];
    if (opts.field) {
      if (!FIELD_RE.test(opts.field)) throw new Error('حقل غير صالح');
      const expr = `json_extract(data, '$.${opts.field}')`;
      if (opts.equals !== undefined) { sql += ` AND ${expr} = ?`; params.push(opts.equals); }
      if (opts.from) { sql += ` AND ${expr} >= ?`; params.push(opts.from); }
      if (opts.to) { sql += ` AND ${expr} <= ?`; params.push(opts.to); }
    }
    return this.db.prepare(sql).all(...params).map((r) => JSON.parse(r.data));
  }

  get(tbl, id) {
    assertTable(tbl);
    const row = this.db.prepare('SELECT data FROM records WHERE tbl = ? AND id = ? AND deleted = 0').get(tbl, id);
    return row ? JSON.parse(row.data) : null;
  }

  // ---------- writes ----------
  put(tbl, obj, userId) {
    assertTable(tbl);
    const now = Date.now();
    const existing = obj.id ? this.get(tbl, obj.id) : null;
    const doc = {
      ...obj,
      id: obj.id || crypto.randomUUID(),
      created_at: existing?.created_at || obj.created_at || now,
      created_by: existing?.created_by || obj.created_by || userId || null,
      updated_at: now,
      updated_by: userId || null,
    };
    this.db.prepare(`
      INSERT INTO records (tbl, id, data, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, 0, 1)
      ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = 0, dirty = 1
    `).run(tbl, doc.id, JSON.stringify(doc), now);
    return doc;
  }

  remove(tbl, id, userId) {
    assertTable(tbl);
    const row = this.db.prepare('SELECT data FROM records WHERE tbl = ? AND id = ?').get(tbl, id);
    if (!row) return false;
    const now = Date.now();
    const doc = { ...JSON.parse(row.data), updated_at: now, updated_by: userId || null };
    this.db.prepare('UPDATE records SET data = ?, updated_at = ?, deleted = 1, dirty = 1 WHERE tbl = ? AND id = ?')
      .run(JSON.stringify(doc), now, tbl, id);
    return true;
  }

  // Seed rows use updated_at = 0 so that any real edit (on any device) always wins.
  seed(tbl, doc) {
    this.db.prepare('INSERT OR IGNORE INTO records (tbl, id, data, updated_at, deleted, dirty) VALUES (?, ?, ?, 0, 0, 0)')
      .run(tbl, doc.id, JSON.stringify({ ...doc, created_at: 0, updated_at: 0 }));
  }

  // ---------- sync helpers ----------
  dirtyRows(limit = 500) {
    return this.db.prepare('SELECT tbl, id, data, updated_at, deleted FROM records WHERE dirty = 1 LIMIT ?').all(limit)
      .map((r) => ({ tbl: r.tbl, id: r.id, data: JSON.parse(r.data), updated_at: r.updated_at, deleted: !!r.deleted }));
  }

  markClean(rows) {
    const stmt = this.db.prepare('UPDATE records SET dirty = 0 WHERE tbl = ? AND id = ? AND updated_at = ?');
    this.db.exec('BEGIN');
    try {
      for (const r of rows) stmt.run(r.tbl, r.id, r.updated_at);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  // Apply rows pulled from the server. Returns number of rows that changed locally.
  applyRemote(rows) {
    const sel = this.db.prepare('SELECT updated_at FROM records WHERE tbl = ? AND id = ?');
    const up = this.db.prepare(`
      INSERT INTO records (tbl, id, data, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 0
    `);
    let changed = 0;
    this.db.exec('BEGIN');
    try {
      for (const r of rows) {
        if (!TABLES.includes(r.tbl)) continue;
        const local = sel.get(r.tbl, r.id);
        const remoteTs = Number(r.updated_at);
        if (local && local.updated_at > remoteTs) continue; // local is newer, it will be pushed
        if (local && local.updated_at === remoteTs) {
          this.db.prepare('UPDATE records SET dirty = 0 WHERE tbl = ? AND id = ? AND updated_at = ?').run(r.tbl, r.id, remoteTs);
          continue;
        }
        up.run(r.tbl, r.id, JSON.stringify(r.data), remoteTs, r.deleted ? 1 : 0);
        changed++;
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return changed;
  }

  // ---------- backup ----------
  exportAll() {
    return this.db.prepare('SELECT tbl, id, data, updated_at, deleted FROM records').all()
      .map((r) => ({ tbl: r.tbl, id: r.id, data: JSON.parse(r.data), updated_at: r.updated_at, deleted: !!r.deleted }));
  }

  importAll(rows) {
    // Restored rows go through the normal merge, then are marked dirty so they reach other devices.
    this.applyRemote(rows);
    this.db.exec('UPDATE records SET dirty = 1');
  }

  pendingCount() {
    return this.db.prepare('SELECT COUNT(*) AS c FROM records WHERE dirty = 1').get().c;
  }
}

module.exports = { Store, TABLES };
