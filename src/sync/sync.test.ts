import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB, setCurrentDB } from '../data/db';
import { openIdbStore } from '../data/store/idb';
import { initRepo, save, deleteCity, seedDefaultCategories } from '../data/repo';
import { SyncEngine } from './engine';
import { DemoRemote, DEMO_REMOTE_DB, setSim } from './demoRemote';
import { decide } from './remote';
import { deleteDB } from 'idb';
import type { Entry } from '../types';

// Minimal browser globals for node.
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
(globalThis as any).window = { dispatchEvent: () => true };

interface Device { db: DB; engine: SyncEngine; uid: string }
let n = 0;
const open: (() => Promise<void>)[] = [];
async function device(uid: string): Promise<Device> {
  const db = await DB.open(await openIdbStore(`test-${++n}`), uid);
  await seedDefaultCategories(db, uid);
  const remote = await DemoRemote.open(uid);
  open.push(async () => { remote.close(); await db.store.close(); });
  return { db, engine: new SyncEngine(db, remote, uid), uid };
}
afterEach(async () => { await Promise.all(open.splice(0).map((c) => c())); });
/** Point the repository at a device (what logging in does in the app). */
const use = (d: Device) => { setCurrentDB(d.db); initRepo(d.uid, () => {}); };
const online = (on: boolean) => setSim({ offline: !on, failRate: 0, latencyMs: 0 });

beforeEach(async () => {
  await deleteDB(DEMO_REMOTE_DB);
  online(true);
});

describe('sync engine', () => {
  it('saves offline, syncs later, and another device pulls it', async () => {
    const a = await device('u1');
    const b = await device('u1');
    use(a);
    online(false);
    const city = await save('cities', { name: 'Mumbai', country: 'India' });
    expect(a.db.get('cities', city.id)!.syncStatus).toBe('pending');
    await a.engine.syncNow();
    expect(a.engine.state.status).toBe('offline');
    expect(a.db.all('outbox')).toHaveLength(1); // nothing lost, still queued

    online(true);
    await a.engine.syncNow();
    expect(a.db.get('cities', city.id)).toMatchObject({ syncStatus: 'synced', version: 1 });
    expect(a.db.all('outbox')).toHaveLength(0);

    await b.engine.syncNow();
    expect(b.db.get('cities', city.id)).toMatchObject({ name: 'Mumbai', version: 1, syncStatus: 'synced' });
  });

  it('coalesces repeated edits into one outbox item', async () => {
    const a = await device('u1');
    use(a);
    const c = await save('cities', { name: 'A' });
    await save('cities', { id: c.id, name: 'B' });
    await save('cities', { id: c.id, name: 'C' });
    expect(a.db.all('outbox')).toHaveLength(1);
    await a.engine.syncNow();
    expect(a.db.get('cities', c.id)).toMatchObject({ name: 'C', version: 1 });
  });

  it('detects concurrent edits as a conflict and never overwrites', async () => {
    const a = await device('u1');
    const b = await device('u1');
    use(a);
    const city = await save('cities', { name: 'Pune' });
    const e = await save('entries', { cityId: city.id, title: 'Lead', description: 'v1' });
    await a.engine.syncNow();
    await b.engine.syncNow();

    use(a); await save('entries', { id: e.id, description: 'from A' });
    use(b); await save('entries', { id: e.id, description: 'from B' });
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(b.db.get('entries', e.id)).toMatchObject({ syncStatus: 'conflict', description: 'from B' });
    const conflict = b.db.get('conflicts', `entries:${e.id}`)!;
    expect((conflict.remote as Entry).description).toBe('from A');

    await b.engine.resolveConflict(conflict.id, 'mine');
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(a.db.get('entries', e.id)).toMatchObject({ description: 'from B', syncStatus: 'synced', version: 3 });
    expect(b.db.all('conflicts')).toHaveLength(0);
  });

  it('pulled remote change conflicts with a pending local edit', async () => {
    const a = await device('u1');
    const b = await device('u1');
    use(a);
    const c = await save('cities', { name: 'X' });
    await a.engine.syncNow();
    await b.engine.syncNow();
    use(a); await save('cities', { id: c.id, notes: 'A' }); await a.engine.syncNow();
    use(b); online(false); await save('cities', { id: c.id, notes: 'B' });
    online(true);
    await b.engine.syncNow();
    expect(b.db.get('cities', c.id)!.syncStatus).toBe('conflict');
    await b.engine.resolveConflict(`cities:${c.id}`, 'theirs');
    expect(b.db.get('cities', c.id)).toMatchObject({ notes: 'A', syncStatus: 'synced' });
  });

  it('a retried write that already reached the server is not a conflict', () => {
    const rec: any = { version: 3, updatedAt: 100, title: 'a', tags: ['x'], syncStatus: 'pending' };
    expect(decide({ version: 3 }, rec)).toBe('write');
    expect(decide({ tags: ['x'], title: 'a', updatedAt: 100, version: 4 }, rec)).toBe('already'); // key order irrelevant
    expect(decide({ version: 4, updatedAt: 100, title: 'b', tags: ['x'] }, rec)).toBe('conflict'); // same ms, different content
    expect(decide(undefined, { version: 0 } as any)).toBe('write');
  });

  it('propagates cascading soft deletes', async () => {
    const a = await device('u1');
    const b = await device('u1');
    use(a);
    const c = await save('cities', { name: 'Gone' });
    const e = await save('entries', { cityId: c.id, title: 'child' });
    await a.engine.syncNow(); await b.engine.syncNow();
    use(a); await deleteCity(c.id); await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.db.get('cities', c.id)!.deletedAt).toBeTruthy();
    expect(b.db.get('entries', e.id)!.deletedAt).toBeTruthy();
  });

  it('marks failures, keeps data, and recovers on retry', async () => {
    const a = await device('u1');
    use(a);
    const c = await save('cities', { name: 'Flaky' });
    setSim({ failRate: 1 });
    await a.engine.syncNow();
    expect(a.engine.state.status).toBe('error');
    expect(a.db.get('cities', c.id)!.syncStatus).toBe('failed');
    expect(a.db.get('outbox', `cities:${c.id}`)).toMatchObject({ attempts: 1 });
    setSim({ failRate: 0 });
    await a.engine.retryFailed();
    expect(a.db.get('cities', c.id)!.syncStatus).toBe('synced');
  });

  it('shares a city, enforces viewer role, and removes data on revoke', async () => {
    const owner = await device('owner');
    const guest = await device('demo-colleague');
    use(owner);
    const c = await save('cities', { name: 'Shared' });
    const e = await save('entries', { cityId: c.id, title: 'Visible' });
    await owner.engine.syncNow();
    const share = await owner.engine.remote.shareCity(owner.db.get('cities', c.id)!, 'priya@tripvault.app', 'viewer', 'Owner');

    await guest.engine.syncNow();
    expect(guest.db.get('entries', e.id)!.title).toBe('Visible');

    use(guest); await save('entries', { id: e.id, title: 'hacked' });
    await guest.engine.syncNow();
    expect(guest.db.get('outbox', `entries:${e.id}`)!.lastError).toMatch(/Permission denied/);

    await owner.engine.remote.revokeShare(share);
    await guest.engine.syncNow();
    expect(guest.db.get('cities', c.id)).toBeUndefined();
    expect(guest.db.get('entries', e.id)).toBeUndefined();
  });

  it('new entries in a shared city are owned by the city owner', async () => {
    const owner = await device('owner');
    const guest = await device('demo-colleague');
    use(owner);
    const c = await save('cities', { name: 'Team city' });
    await owner.engine.syncNow();
    await owner.engine.remote.shareCity(owner.db.get('cities', c.id)!, 'priya@tripvault.app', 'editor', 'Owner');
    await guest.engine.syncNow();
    use(guest);
    const e = await save('entries', { cityId: c.id, title: 'Added by guest' });
    expect(e.ownerId).toBe('owner');
    await guest.engine.syncNow();
    await owner.engine.syncNow();
    expect(owner.db.get('entries', e.id)!.title).toBe('Added by guest');
  });
});
