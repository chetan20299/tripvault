import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Table } from '../../types';
import type { LocalStore, TxOp } from './types';
import { blobToBase64, base64ToBlob } from '../../lib/util';

const sqlite = new SQLiteConnection(CapacitorSQLite);

/** Native (Android/iOS) store: documents as JSON rows in SQLite, blobs as base64. */
export async function openSqliteStore(name: string): Promise<LocalStore> {
  const dbName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const db = (await sqlite.isConnection(dbName, false)).result
    ? await sqlite.retrieveConnection(dbName, false)
    : await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
  await db.open();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS docs (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tbl, id));
    CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL);
  `);
  return {
    async getAll(table: Table) {
      const res = await db.query('SELECT data FROM docs WHERE tbl = ?', [table]);
      return (res.values ?? []).map((r) => JSON.parse(r.data));
    },
    async tx(ops: TxOp[]) {
      const set: { statement: string; values: any[] }[] = [];
      for (const op of ops) {
        op.put?.forEach((r) => set.push({ statement: 'INSERT OR REPLACE INTO docs (tbl, id, data) VALUES (?, ?, ?)', values: [op.table, r.id, JSON.stringify(r)] }));
        op.del?.forEach((id) => set.push({ statement: 'DELETE FROM docs WHERE tbl = ? AND id = ?', values: [op.table, id] }));
      }
      if (set.length) await db.executeSet(set, true);
    },
    async getBlob(id) {
      const res = await db.query('SELECT mime, data FROM blobs WHERE id = ?', [id]);
      const row = res.values?.[0];
      return row ? base64ToBlob(row.data, row.mime) : undefined;
    },
    async putBlob(id, blob) {
      await db.run('INSERT OR REPLACE INTO blobs (id, mime, data) VALUES (?, ?, ?)', [id, blob.type, await blobToBase64(blob)]);
    },
    async deleteBlob(id) { await db.run('DELETE FROM blobs WHERE id = ?', [id]); },
    async destroy() {
      await db.close();
      await sqlite.closeConnection(dbName, false);
      await CapacitorSQLite.deleteDatabase({ database: dbName });
    },
    async close() { await sqlite.closeConnection(dbName, false); },
  };
}
