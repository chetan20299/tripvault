import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { ALL_TABLES, type Table } from '../../types';
import type { LocalStore, TxOp } from './types';

export async function openIdbStore(name: string): Promise<LocalStore> {
  const db: IDBPDatabase = await openDB(name, 1, {
    upgrade(db) {
      for (const t of ALL_TABLES) db.createObjectStore(t, { keyPath: 'id' });
      db.createObjectStore('blobs');
    },
  });
  return {
    getAll: (table: Table) => db.getAll(table),
    async tx(ops: TxOp[]) {
      const tx = db.transaction([...new Set(ops.map((o) => o.table))], 'readwrite');
      for (const op of ops) {
        const s = tx.objectStore(op.table);
        op.put?.forEach((r) => s.put(r));
        op.del?.forEach((id) => s.delete(id));
      }
      await tx.done;
    },
    getBlob: (id) => db.get('blobs', id),
    putBlob: async (id, blob) => { await db.put('blobs', blob, id); },
    deleteBlob: (id) => db.delete('blobs', id),
    async destroy() { db.close(); await deleteDB(name); },
    async close() { db.close(); },
  };
}
