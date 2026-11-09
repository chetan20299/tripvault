import type { AnyRecord, City, Entry, ImageMeta, OutboxItem, RowTypes, SyncedTable, Visit, Category } from '../types';
import { getDB, type DB } from './db';
import type { TxOp } from './store';
import { DEFAULT_CATEGORIES } from './categories';
import { uid } from '../lib/util';

const DEFAULTS: Record<SyncedTable, object> = {
  cities: { name: '', state: '', country: '', description: '', notes: '', coverImageId: null, lastVisitedAt: null },
  categories: { name: '', icon: 'note', color: '#868E96', isDefault: false, sortOrder: 100 },
  entries: { cityId: '', categoryId: 'notes', title: '', description: '', address: '', contactName: '', phone: '', email: '', website: '', visitDate: '', rating: 0, priority: '', tags: [], customFields: [], imageIds: [] },
  visits: { cityId: '', startDate: '', endDate: '', purpose: '', notes: '' },
  images: { cityId: '', parentId: '', mime: 'image/jpeg', width: 0, height: 0, size: 0, remoteRef: null },
};

let ctx = { uid: '', onChange: () => {} };
/** Bind the repository to the signed-in user and the sync scheduler. */
export function initRepo(userId: string, onChange: () => void) {
  ctx = { uid: userId, onChange };
}

type Input<T extends SyncedTable> = Partial<RowTypes[T]> & { id?: string };

/** Builds the ops for one local mutation: the record (pending) + its coalesced outbox entry. */
function opsFor<T extends SyncedTable>(db: DB, table: T, data: Input<T>, now: number): { rec: RowTypes[T]; ops: TxOp[] } {
  const id = data.id ?? uid();
  const existing = db.get(table, id) as AnyRecord | undefined;
  const inConflict = existing?.syncStatus === 'conflict';
  const rec = {
    ...DEFAULTS[table],
    deletedAt: null, version: 0, lastSyncedAt: null,
    ...existing,
    ...data,
    id,
    // Children of a shared city belong to the city owner (they live under the owner's Firestore path).
    ownerId: existing?.ownerId ?? data.ownerId ?? cityOwner(db, (data as { cityId?: string }).cityId) ?? ctx.uid,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    // A record in conflict stays in conflict until the user resolves it; resolution pushes the latest local copy.
    syncStatus: inConflict ? 'conflict' : 'pending',
  } as RowTypes[T];
  const ops: TxOp[] = [{ table, put: [rec] }];
  if (!inConflict) ops.push({ table: 'outbox', put: [outboxItem(db, table, id, now)] });
  return { rec, ops };
}

const cityOwner = (db: DB, cityId?: string) => (cityId ? db.get('cities', cityId)?.ownerId : undefined);

export function outboxItem(db: DB, table: SyncedTable, id: string, now = Date.now()): OutboxItem {
  const prev = db.get('outbox', `${table}:${id}`);
  return { id: `${table}:${id}`, table, recordId: id, attempts: 0, nextAttemptAt: 0, lastError: null, createdAt: prev?.createdAt ?? now };
}

/** Atomically saves several records (all-or-nothing). */
export async function saveMany(items: { table: SyncedTable; data: Input<any> }[]): Promise<AnyRecord[]> {
  const db = getDB();
  const now = Date.now();
  const built = items.map((i) => opsFor(db, i.table, i.data, now));
  await db.tx(built.flatMap((b) => b.ops));
  ctx.onChange();
  return built.map((b) => b.rec);
}

export async function save<T extends SyncedTable>(table: T, data: Input<T>): Promise<RowTypes[T]> {
  return (await saveMany([{ table, data }]))[0] as RowTypes[T];
}

const live = <T extends SyncedTable>(table: T, pred: (r: RowTypes[T]) => boolean) =>
  getDB().all(table).filter((r) => !r.deletedAt && pred(r as RowTypes[T]));

export async function deleteEntry(id: string) {
  const now = Date.now();
  const imgs = live('images', (i) => i.parentId === id);
  await saveMany([{ table: 'entries', data: { id, deletedAt: now } }, ...imgs.map((i) => ({ table: 'images' as const, data: { id: i.id, deletedAt: now } }))]);
  await Promise.all(imgs.map((i) => getDB().store.deleteBlob(i.id)));
}

/** Soft-deletes a city and everything under it in one transaction. */
export async function deleteCity(id: string) {
  const now = Date.now();
  const del = (table: SyncedTable, rows: { id: string }[]) => rows.map((r) => ({ table, data: { id: r.id, deletedAt: now } }));
  const imgs = live('images', (i) => i.cityId === id);
  await saveMany([
    { table: 'cities', data: { id, deletedAt: now } },
    ...del('entries', live('entries', (e) => e.cityId === id)),
    ...del('visits', live('visits', (v) => v.cityId === id)),
    ...del('images', imgs),
  ]);
  await Promise.all(imgs.map((i) => getDB().store.deleteBlob(i.id)));
}

export async function deleteCategory(id: string, moveTo: string) {
  const now = Date.now();
  const moved = live('entries', (e) => e.categoryId === id).map((e) => ({ table: 'entries' as const, data: { id: e.id, categoryId: moveTo } }));
  await saveMany([{ table: 'categories', data: { id, deletedAt: now } }, ...moved]);
}

/** Stores the image bytes locally first, then the metadata record (an orphan blob after a crash is harmless). */
export async function addImage(blob: Blob, meta: { cityId: string; parentId: string; width: number; height: number }): Promise<ImageMeta> {
  const id = uid();
  await getDB().store.putBlob(id, blob);
  return save('images', { id, ...meta, mime: blob.type || 'image/jpeg', size: blob.size });
}

export async function removeImage(id: string) {
  await save('images', { id, deletedAt: Date.now() });
  await getDB().store.deleteBlob(id);
}

export async function saveVisit(data: Input<'visits'>) {
  const v = await save('visits', data);
  const city = getDB().get('cities', v.cityId);
  const t = Date.parse(v.endDate || v.startDate);
  if (city && !Number.isNaN(t) && t > (city.lastVisitedAt ?? 0)) await save('cities', { id: city.id, lastVisitedAt: t });
  return v;
}

/** Default categories are seeded as already-synced v0 so two devices seeding the same ids never conflict. */
export async function seedDefaultCategories(db: DB, ownerId: string) {
  if (db.all('categories').length) return;
  const now = Date.now();
  const rows: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
    ...c, isDefault: true, sortOrder: i, ownerId, createdAt: now, updatedAt: 0, deletedAt: null, version: 0, syncStatus: 'synced', lastSyncedAt: null,
  }));
  await db.tx([{ table: 'categories', put: rows }]);
}

// Convenience selectors used across pages
export const cityEntries = (entries: Entry[], cityId: string) => entries.filter((e) => e.cityId === cityId && !e.deletedAt);
export const cityVisits = (visits: Visit[], cityId: string) => visits.filter((v) => v.cityId === cityId && !v.deletedAt).sort((a, b) => b.startDate.localeCompare(a.startDate));
export const cityLabel = (c: City) => [c.name, c.state, c.country].filter(Boolean).join(', ');
