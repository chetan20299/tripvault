import type { DB } from '../data/db';
import type { TxOp } from '../data/store';
import { outboxItem } from '../data/repo';
import { SYNCED_TABLES, type AnyRecord, type Conflict, type ImageMeta, type SyncedTable } from '../types';
import { OfflineError, type RemoteBackend } from './remote';
import { errMsg } from '../lib/util';

export type EngineStatus = 'idle' | 'syncing' | 'offline' | 'error';
export interface EngineState {
  status: EngineStatus;
  lastSyncAt: number | null;
  lastError: string | null;
  progress: { done: number; total: number } | null;
}
export interface SyncSettings { autoSync: boolean; downloadImages: boolean }
export const DEFAULT_SYNC_SETTINGS: SyncSettings = { autoSync: true, downloadImages: true };

const PUSH_ORDER: SyncedTable[] = ['categories', 'cities', 'images', 'entries', 'visits'];
const backoff = (attempts: number) => Math.min(10 * 60_000, 5_000 * 2 ** (attempts - 1));

export class SyncEngine {
  state: EngineState;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private debounce?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  private downloading = new Map<string, Promise<Blob | undefined>>();

  constructor(private db: DB, readonly remote: RemoteBackend, private uid: string) {
    this.state = { status: remote.isOnline() ? 'idle' : 'offline', lastSyncAt: db.meta<number>('lastSyncAt') ?? null, lastError: null, progress: null };
  }

  get settings(): SyncSettings {
    return { ...DEFAULT_SYNC_SETTINGS, ...this.db.meta<SyncSettings>('syncSettings') };
  }

  // ---- lifecycle -------------------------------------------------------------------------
  private onOnline = () => this.syncNow();
  private onOffline = () => this.set({ status: 'offline' });
  private onVisible = () => document.visibilityState === 'visible' && this.settings.autoSync && this.syncNow();

  start() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.interval = setInterval(() => this.settings.autoSync && this.syncNow(), 60_000);
    if (this.settings.autoSync) this.syncNow();
  }

  stop() {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisible);
    clearInterval(this.interval);
    clearTimeout(this.debounce);
  }

  /** Called after every local change; pushes shortly after the user stops typing. */
  schedule() {
    if (!this.settings.autoSync) return;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.syncNow(), 1500);
  }

  /** Runs one push+pull cycle. Concurrent calls share the running cycle and queue one follow-up. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) { this.again = false; void this.syncNow(); }
    });
    return this.running;
  }

  /** Makes every failed item eligible immediately. */
  async retryFailed() {
    const items = this.db.all('outbox').map((i) => ({ ...i, nextAttemptAt: 0 }));
    await this.db.tx([{ table: 'outbox', put: items }]);
    return this.syncNow();
  }

  private async run() {
    if (!this.remote.isOnline()) return this.set({ status: 'offline' });
    this.set({ status: 'syncing', lastError: null });
    try {
      const failures = await this.push();
      await this.pull();
      const now = Date.now();
      await this.db.setMeta('lastSyncAt', now);
      this.set({ status: failures ? 'error' : 'idle', lastSyncAt: now, lastError: failures ? `${failures} change(s) failed to sync — will retry automatically` : null, progress: null });
      if (this.settings.downloadImages) void this.prefetchImages();
    } catch (e) {
      if (e instanceof OfflineError || !this.remote.isOnline()) this.set({ status: 'offline', progress: null });
      else this.set({ status: 'error', lastError: errMsg(e), progress: null });
    }
  }

  // ---- push ------------------------------------------------------------------------------
  private async push(): Promise<number> {
    const now = Date.now();
    const items = this.db.all('outbox')
      .filter((i) => i.nextAttemptAt <= now)
      .sort((a, b) => PUSH_ORDER.indexOf(a.table) - PUSH_ORDER.indexOf(b.table) || a.createdAt - b.createdAt);
    let failures = 0;
    for (const [n, item] of items.entries()) {
      this.set({ progress: { done: n, total: items.length } });
      let rec = this.db.get(item.table, item.recordId) as AnyRecord | undefined;
      if (!rec || rec.syncStatus === 'conflict') {
        await this.db.tx([{ table: 'outbox', del: [item.id] }]);
        continue;
      }
      try {
        if (item.table === 'images' && !rec.deletedAt && !(rec as ImageMeta).remoteRef) {
          const blob = await this.db.store.getBlob(rec.id);
          if (!blob) throw new Error('Image file is missing on this device');
          const remoteRef = await this.remote.uploadImage(rec as ImageMeta, blob);
          // Persist the ref right away so a retry never re-uploads the bytes.
          const latest = this.db.get('images', rec.id)!;
          await this.db.tx([{ table: 'images', put: [{ ...latest, remoteRef }] }]);
          rec = { ...rec, remoteRef } as ImageMeta;
        }
        const res = await this.remote.push(item.table, rec);
        const latest = this.db.get(item.table, rec.id) as AnyRecord;
        const ops: TxOp[] = [];
        if (res.ok) {
          if (latest.updatedAt === rec.updatedAt) {
            ops.push({ table: item.table, put: [{ ...latest, version: res.version, syncStatus: 'synced', lastSyncedAt: Date.now() }] });
            ops.push({ table: 'outbox', del: [item.id] });
          } else {
            // Edited while uploading: keep it pending on top of the new server version.
            ops.push({ table: item.table, put: [{ ...latest, version: res.version }] });
            this.again = true;
          }
        } else {
          ops.push(...this.conflictOps(item.table, latest, res.conflict));
        }
        await this.db.tx(ops);
      } catch (e) {
        if (e instanceof OfflineError || !this.remote.isOnline()) throw e instanceof OfflineError ? e : new OfflineError();
        failures++;
        const attempts = item.attempts + 1;
        const latest = this.db.get(item.table, item.recordId) as AnyRecord;
        await this.db.tx([
          { table: 'outbox', put: [{ ...item, attempts, nextAttemptAt: Date.now() + backoff(attempts), lastError: errMsg(e) }] },
          { table: item.table, put: [{ ...latest, syncStatus: 'failed' }] },
        ]);
      }
    }
    return failures;
  }

  /** Never overwrites: keeps both copies and lets the user decide. */
  private conflictOps(table: SyncedTable, local: AnyRecord, remote: AnyRecord): TxOp[] {
    const c: Conflict = { id: `${table}:${local.id}`, table, recordId: local.id, local, remote, detectedAt: Date.now() };
    return [
      { table: 'conflicts', put: [c] },
      { table, put: [{ ...local, syncStatus: 'conflict' }] },
      { table: 'outbox', del: [c.id] },
    ];
  }

  // ---- pull ------------------------------------------------------------------------------
  private async pull() {
    const res = await this.remote.pull(this.db.meta<Record<string, any>>('pullCursors') ?? {});
    const now = Date.now();
    const ops: TxOp[] = [];
    const blobsToDrop: string[] = [];
    for (const { table, rec } of res.changes) {
      if (!SYNCED_TABLES.includes(table)) continue;
      const local = this.db.get(table, rec.id) as AnyRecord | undefined;
      if (!local || local.syncStatus === 'synced') {
        if (!local || rec.version > local.version) {
          ops.push({ table, put: [{ ...rec, syncStatus: 'synced', lastSyncedAt: now }] });
          if (table === 'images' && rec.deletedAt) blobsToDrop.push(rec.id);
        }
      } else if (local.syncStatus === 'conflict') {
        const c = this.db.get('conflicts', `${table}:${rec.id}`);
        if (c && rec.version > c.remote.version) ops.push({ table: 'conflicts', put: [{ ...c, remote: rec }] });
      } else if (rec.version > local.version) {
        ops.push(...this.conflictOps(table, local, rec)); // pending/failed local edit vs newer remote edit
      }
    }
    const keep = new Set(res.shares.map((s) => s.id));
    ops.push({ table: 'shares', put: res.shares, del: this.db.all('shares').filter((s) => !keep.has(s.id)).map((s) => s.id) });
    ops.push({ table: 'meta', put: [{ id: 'pullCursors', value: res.cursors } as any] });
    await this.db.tx(ops); // cursor advances atomically with the data it covers
    await Promise.all(blobsToDrop.map((id) => this.db.store.deleteBlob(id)));

    // Access revoked → remove the other user's data from this device.
    const shared = new Set(res.shares.filter((s) => s.granteeUid === this.uid).map((s) => s.cityId));
    const revoke: TxOp[] = SYNCED_TABLES.map((table) => ({
      table,
      del: this.db.all(table).filter((r) => r.ownerId !== this.uid && !shared.has(table === 'cities' ? r.id : (r as any).cityId)).map((r) => r.id),
    })).filter((o) => o.del.length);
    if (revoke.length) await this.db.tx([...revoke, { table: 'outbox', del: revoke.flatMap((o) => o.del!.map((id) => `${o.table}:${id}`)) }]);
  }

  // ---- conflicts -------------------------------------------------------------------------
  async resolveConflict(conflictId: string, choice: 'mine' | 'theirs') {
    const c = this.db.get('conflicts', conflictId);
    if (!c) return;
    const local = (this.db.get(c.table, c.recordId) as AnyRecord | undefined) ?? c.local;
    const ops: TxOp[] = [{ table: 'conflicts', del: [c.id] }];
    if (choice === 'mine') {
      ops.push({ table: c.table, put: [{ ...local, version: c.remote.version, updatedAt: Date.now(), syncStatus: 'pending' }] });
      ops.push({ table: 'outbox', put: [outboxItem(this.db, c.table, c.recordId)] });
    } else {
      ops.push({ table: c.table, put: [{ ...c.remote, syncStatus: 'synced', lastSyncedAt: Date.now() }] });
      ops.push({ table: 'outbox', del: [c.id] });
    }
    await this.db.tx(ops);
    this.schedule();
  }

  // ---- images ----------------------------------------------------------------------------
  /** Local blob if present; otherwise downloads (and caches for offline) when online. */
  getImageBlob(meta: ImageMeta): Promise<Blob | undefined> {
    let p = this.downloading.get(meta.id);
    if (!p) {
      p = (async () => {
        const local = await this.db.store.getBlob(meta.id);
        if (local || !meta.remoteRef || !this.remote.isOnline()) return local;
        const blob = await this.remote.downloadImage(meta);
        await this.db.store.putBlob(meta.id, blob);
        return blob;
      })().finally(() => this.downloading.delete(meta.id));
      this.downloading.set(meta.id, p);
    }
    return p;
  }

  private async prefetchImages() {
    const imgs = this.db.all('images').filter((i) => !i.deletedAt && i.remoteRef);
    for (const img of imgs) {
      if (!this.remote.isOnline()) return;
      try { await this.getImageBlob(img); } catch { /* best effort; retried next cycle */ }
    }
  }

  // ---- state -----------------------------------------------------------------------------
  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
}
