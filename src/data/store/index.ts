import { Capacitor } from '@capacitor/core';
import type { LocalStore } from './types';

export type { LocalStore, TxOp } from './types';

/** SQLite on Android/iOS, IndexedDB in browsers. */
export async function openStore(name: string): Promise<LocalStore> {
  if (Capacitor.isNativePlatform()) return (await import('./sqlite')).openSqliteStore(name);
  return (await import('./idb')).openIdbStore(name);
}
