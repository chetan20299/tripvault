import { useSyncExternalStore } from 'react';
import { ALL_TABLES, type RowTypes, type Table } from '../types';
import type { LocalStore, TxOp } from './store';

/**
 * In-memory mirror of the local store. Reads are synchronous (fast UI), writes go to the
 * persistent store first and only then update memory, so the UI never shows unsaved data.
 * ponytail: whole tables in memory — fine for tens of thousands of records; page from store if a user ever exceeds that.
 */
export class DB {
  private cache = new Map<Table, Map<string, any>>();
  private snaps = new Map<Table, any[]>();
  private listeners = new Set<() => void>();
  private constructor(readonly store: LocalStore, readonly name: string) {}

  static async open(store: LocalStore, name: string) {
    const db = new DB(store, name);
    for (const t of ALL_TABLES) {
      const rows = await store.getAll(t);
      db.cache.set(t, new Map(rows.map((r) => [r.id, r])));
    }
    return db;
  }

  all<T extends Table>(table: T): RowTypes[T][] {
    let s = this.snaps.get(table);
    if (!s) this.snaps.set(table, (s = [...this.cache.get(table)!.values()]));
    return s;
  }

  get<T extends Table>(table: T, id: string): RowTypes[T] | undefined {
    return this.cache.get(table)!.get(id);
  }

  async tx(ops: TxOp[]) {
    if (!ops.length) return;
    await this.store.tx(ops);
    for (const op of ops) {
      const m = this.cache.get(op.table)!;
      op.put?.forEach((r) => m.set(r.id, r));
      op.del?.forEach((id) => m.delete(id));
      this.snaps.delete(op.table);
    }
    this.listeners.forEach((l) => l());
  }

  meta<V>(key: string): V | undefined {
    return this.get('meta', key)?.value as V | undefined;
  }
  setMeta(key: string, value: unknown) {
    return this.tx([{ table: 'meta', put: [{ id: key, value } as any] }]);
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
}

let current: DB | null = null;
export const setCurrentDB = (db: DB | null) => (current = db);
export function getDB(): DB {
  if (!current) throw new Error('Local database is not open');
  return current;
}

const noop = () => () => {};
const EMPTY: never[] = [];

/** Live rows of a table (soft-deleted rows included — filter with `alive`). */
export function useTable<T extends Table>(table: T): RowTypes[T][] {
  return useSyncExternalStore(current?.subscribe ?? noop, () => current?.all(table) ?? EMPTY);
}

export const alive = <R extends { deletedAt?: number | null }>(rows: R[]) => rows.filter((r) => !r.deletedAt);
