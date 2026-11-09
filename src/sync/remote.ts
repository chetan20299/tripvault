import type { AnyRecord, City, ImageMeta, Share, SyncedTable } from '../types';

export type PushResult = { ok: true; version: number } | { ok: false; conflict: AnyRecord };

export interface PullResult {
  changes: { table: SyncedTable; rec: AnyRecord }[];
  /** Complete list of shares involving the user (as owner or grantee). */
  shares: Share[];
  cursors: Record<string, any>;
}

/** Server side of sync. Implemented by Firebase (production) and DemoRemote (simulated). */
export interface RemoteBackend {
  isOnline(): boolean;
  /** Version-checked write: succeeds only if the server copy is still at `rec.version`. */
  push(table: SyncedTable, rec: AnyRecord): Promise<PushResult>;
  pull(cursors: Record<string, any>): Promise<PullResult>;
  uploadImage(meta: ImageMeta, blob: Blob): Promise<string>;
  downloadImage(meta: ImageMeta): Promise<Blob>;
  shareCity(city: City, email: string, role: Share['role'], ownerName: string): Promise<Share>;
  revokeShare(share: Share): Promise<void>;
}

/** Thrown when the backend can't be reached; sync pauses instead of counting a failed attempt. */
export class OfflineError extends Error {
  constructor(msg = 'You are offline') { super(msg); }
}

/** Fields that only exist on the device. */
export function toRemote(rec: AnyRecord): Record<string, unknown> {
  const { syncStatus: _s, lastSyncedAt: _l, ...rest } = rec;
  return rest;
}

/**
 * Remote decision shared by both backends.
 * - versions match → accept
 * - remote is exactly our write already applied (a retry after a lost response) → accept, idempotent
 * - otherwise someone else wrote first → conflict
 */
export function decide(remote: Record<string, any> | undefined, rec: AnyRecord): 'write' | 'already' | 'conflict' {
  const rv = remote?.version ?? 0;
  if (rv === rec.version) return 'write';
  if (remote && rv === rec.version + 1 && sameContent(remote, toRemote(rec))) return 'already';
  return 'conflict';
}

const SKIP = new Set(['version', 'serverUpdatedAt', 'syncStatus', 'lastSyncedAt']);
/** Key-order-independent JSON, so copies from Firestore and from the device compare equal. */
const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}`
      : JSON.stringify(v ?? null);
const sameContent = (a: Record<string, any>, b: Record<string, any>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => SKIP.has(k) || stable(a[k]) === stable(b[k]));
