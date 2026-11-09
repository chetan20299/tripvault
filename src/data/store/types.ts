import type { Table } from '../../types';

export interface TxOp { table: Table; put?: ({ id: string } & Record<string, any>)[]; del?: string[] }

/** Persistent local storage. Implemented by IndexedDB (web) and SQLite (native). */
export interface LocalStore {
  getAll(table: Table): Promise<any[]>;
  /** Applies all ops atomically. */
  tx(ops: TxOp[]): Promise<void>;
  getBlob(id: string): Promise<Blob | undefined>;
  putBlob(id: string, blob: Blob): Promise<void>;
  deleteBlob(id: string): Promise<void>;
  /** Wipes the whole database. */
  destroy(): Promise<void>;
  close(): Promise<void>;
}
