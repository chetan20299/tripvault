import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import type { AnyRecord, City, Entry, ImageMeta, Share, SyncedTable } from '../types';
import { OfflineError, decide, toRemote, type PullResult, type PushResult, type RemoteBackend } from './remote';

export const DEMO_USERS = [
  { uid: 'demo-user', email: 'demo@tripvault.app', name: 'Alex Morgan' },
  { uid: 'demo-colleague', email: 'priya@tripvault.app', name: 'Priya Shah' },
  { uid: 'demo-rahul', email: 'rahul@tripvault.app', name: 'Rahul Verma' },
];
export const DEMO_REMOTE_DB = 'tripvault-demo-remote';

export interface SimSettings { offline: boolean; failRate: number; latencyMs: number }
const SIM_KEY = 'tv.demo.sim';
export function getSim(): SimSettings {
  try { return { offline: false, failRate: 0, latencyMs: 350, ...JSON.parse(localStorage.getItem(SIM_KEY) ?? '{}') }; }
  catch { return { offline: false, failRate: 0, latencyMs: 350 }; }
}
export function setSim(s: Partial<SimSettings>) {
  localStorage.setItem(SIM_KEY, JSON.stringify({ ...getSim(), ...s }));
  if (s.offline !== undefined) window.dispatchEvent(new Event(s.offline ? 'offline' : 'online'));
}

interface ServerDoc { key: string; table: SyncedTable; seq: number; data: Record<string, any> }

/**
 * Simulated server for Demo Mode. Lives in its own IndexedDB — never touches Firebase.
 * Enforces the same ownership/sharing rules as firestore.rules.
 */
export class DemoRemote implements RemoteBackend {
  private constructor(private db: IDBPDatabase, private uid: string) {}

  static async open(uid: string) {
    const db = await openDB(DEMO_REMOTE_DB, 1, {
      upgrade(db) {
        db.createObjectStore('docs', { keyPath: 'key' });
        db.createObjectStore('shares', { keyPath: 'id' });
        db.createObjectStore('blobs');
        db.createObjectStore('meta');
      },
    });
    return new DemoRemote(db, uid);
  }

  static destroy() { return deleteDB(DEMO_REMOTE_DB); }
  close() { this.db.close(); }

  isOnline() { return globalThis.navigator?.onLine !== false && !getSim().offline; }

  private async net() {
    const sim = getSim();
    if (sim.latencyMs) await new Promise((r) => setTimeout(r, sim.latencyMs * (0.5 + Math.random())));
    if (!this.isOnline()) throw new OfflineError();
    if (Math.random() < sim.failRate) throw new Error('Simulated server error (503)');
  }

  private async nextSeq(tx: any): Promise<number> {
    const seq = ((await tx.objectStore('meta').get('seq')) ?? 0) + 1;
    await tx.objectStore('meta').put(seq, 'seq');
    return seq;
  }

  private async share(ownerId: string, cityId: string): Promise<Share | undefined> {
    return this.db.get('shares', `${ownerId}_${cityId}_${this.uid}`);
  }

  private async canWrite(rec: AnyRecord, table: SyncedTable) {
    if (rec.ownerId === this.uid) return true;
    if (table === 'categories') return false;
    const cityId = table === 'cities' ? rec.id : (rec as Entry).cityId;
    return (await this.share(rec.ownerId, cityId))?.role === 'editor';
  }

  async push(table: SyncedTable, rec: AnyRecord): Promise<PushResult> {
    await this.net();
    if (!(await this.canWrite(rec, table))) throw new Error('Permission denied: you can only view this shared city');
    const tx = this.db.transaction(['docs', 'meta'], 'readwrite');
    const key = `${rec.ownerId}/${table}/${rec.id}`;
    const cur: ServerDoc | undefined = await tx.objectStore('docs').get(key);
    const d = decide(cur?.data, rec);
    if (d === 'conflict') { await tx.done; return { ok: false, conflict: cur!.data as AnyRecord }; }
    if (d === 'already') { await tx.done; return { ok: true, version: cur!.data.version }; }
    const data = { ...toRemote(rec), version: rec.version + 1 };
    await tx.objectStore('docs').put({ key, table, seq: await this.nextSeq(tx), data } satisfies ServerDoc);
    await tx.done;
    return { ok: true, version: data.version };
  }

  async pull(cursors: Record<string, any>): Promise<PullResult> {
    await this.net();
    const since: number = cursors.seq ?? 0;
    const all: ServerDoc[] = await this.db.getAll('docs');
    const shares: Share[] = (await this.db.getAll('shares')).filter((s: Share) => s.ownerId === this.uid || s.granteeUid === this.uid);
    const sharedWithMe = new Set(shares.filter((s) => s.granteeUid === this.uid).map((s) => `${s.ownerId}/${s.cityId}`));
    const visible = (d: ServerDoc) =>
      d.data.ownerId === this.uid ||
      (d.table !== 'categories' && sharedWithMe.has(`${d.data.ownerId}/${d.table === 'cities' ? d.data.id : d.data.cityId}`));
    // Newly shared cities need their full history, not just changes since the cursor.
    const known = new Set((cursors.sharedKeys as string[] | undefined) ?? []);
    const changes = all
      .filter((d) => visible(d) && (d.seq > since || (d.data.ownerId !== this.uid && !known.has(`${d.data.ownerId}/${d.table === 'cities' ? d.data.id : d.data.cityId}`))))
      .map((d) => ({ table: d.table, rec: d.data as AnyRecord }));
    const seq = (await this.db.get('meta', 'seq')) ?? 0;
    return { changes, shares, cursors: { seq, sharedKeys: [...sharedWithMe] } };
  }

  async uploadImage(meta: ImageMeta, blob: Blob): Promise<string> {
    await this.net();
    await this.db.put('blobs', blob, meta.id);
    return `demo:${meta.id}`;
  }

  async downloadImage(meta: ImageMeta): Promise<Blob> {
    await this.net();
    const b = await this.db.get('blobs', meta.id);
    if (!b) throw new Error('Image not found on server');
    return b;
  }

  async shareCity(city: City, email: string, role: Share['role'], ownerName: string): Promise<Share> {
    await this.net();
    const user = DEMO_USERS.find((u) => u.email === email.trim().toLowerCase());
    if (!user) throw new Error(`No TripVault user with email ${email}. In demo, try ${DEMO_USERS.slice(1).map((u) => u.email).join(' or ')}`);
    if (user.uid === this.uid) throw new Error('You cannot share a city with yourself');
    const share: Share = { id: `${city.ownerId}_${city.id}_${user.uid}`, ownerId: city.ownerId, cityId: city.id, granteeUid: user.uid, granteeEmail: user.email, ownerName, role, createdAt: Date.now() };
    await this.db.put('shares', share);
    return share;
  }

  async revokeShare(share: Share) {
    await this.net();
    await this.db.delete('shares', share.id);
  }

  // ---- demo-only helpers -----------------------------------------------------------------
  /** Writes records straight to the server as if they had been synced long ago. */
  async seed(table: SyncedTable, recs: AnyRecord[], blobs: Record<string, Blob> = {}) {
    const tx = this.db.transaction(['docs', 'meta', 'blobs'], 'readwrite');
    for (const r of recs) {
      await tx.objectStore('docs').put({ key: `${r.ownerId}/${table}/${r.id}`, table, seq: await this.nextSeq(tx), data: toRemote(r) });
      if (blobs[r.id]) await tx.objectStore('blobs').put(blobs[r.id], r.id);
    }
    await tx.done;
  }
  async seedShare(share: Share) { await this.db.put('shares', share); }

  /** Simulates a colleague's device editing one of your entries on the server. */
  async simulateRemoteEdit(): Promise<string | null> {
    const tx = this.db.transaction(['docs', 'meta'], 'readwrite');
    const docs: ServerDoc[] = (await tx.objectStore('docs').getAll()).filter((d: ServerDoc) => d.table === 'entries' && d.data.ownerId === this.uid && !d.data.deletedAt);
    if (!docs.length) { await tx.done; return null; }
    const d = docs[Math.floor(Math.random() * docs.length)];
    d.data = { ...d.data, description: `${d.data.description}\n\n[Updated from your other device at ${new Date().toLocaleTimeString()}]`, version: d.data.version + 1, updatedAt: Date.now() };
    d.seq = await this.nextSeq(tx);
    await tx.objectStore('docs').put(d);
    await tx.done;
    return d.data.title;
  }
}
