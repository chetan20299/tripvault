export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'failed' | 'conflict';

export interface SyncMeta {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Server version this local copy is based on. Server increments on every accepted write. */
  version: number;
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
}

export interface City extends SyncMeta {
  name: string;
  state: string;
  country: string;
  description: string;
  notes: string;
  coverImageId: string | null;
  lastVisitedAt: number | null;
}

export interface Category extends SyncMeta {
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface CustomField { label: string; value: string }

export interface Entry extends SyncMeta {
  cityId: string;
  categoryId: string;
  title: string;
  description: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  visitDate: string; // yyyy-mm-dd
  rating: number; // 0 = unrated, 1..5
  priority: '' | 'low' | 'medium' | 'high';
  tags: string[];
  customFields: CustomField[];
  imageIds: string[];
}

export interface Visit extends SyncMeta {
  cityId: string;
  startDate: string;
  endDate: string;
  purpose: string;
  notes: string;
}

export interface ImageMeta extends SyncMeta {
  cityId: string;
  parentId: string; // entry id or city id
  mime: string;
  width: number;
  height: number;
  size: number;
  /** Where the bytes live remotely; null until uploaded. */
  remoteRef: string | null;
}

/** Sharing is an online operation (requires looking up the grantee), so shares never go through the outbox. */
export interface Share {
  id: string; // `${ownerId}_${cityId}_${granteeUid}`
  ownerId: string;
  cityId: string;
  granteeUid: string;
  granteeEmail: string;
  ownerName: string;
  role: 'viewer' | 'editor';
  createdAt: number;
}

export interface OutboxItem {
  id: string; // `${table}:${recordId}` — coalesces repeated edits into one push
  table: SyncedTable;
  recordId: string;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
}

export interface Conflict {
  id: string; // `${table}:${recordId}`
  table: SyncedTable;
  recordId: string;
  local: AnyRecord;
  remote: AnyRecord;
  detectedAt: number;
}

export interface MetaRow { id: string; value: unknown }

export const SYNCED_TABLES = ['cities', 'categories', 'entries', 'visits', 'images'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
export const ALL_TABLES = [...SYNCED_TABLES, 'shares', 'outbox', 'conflicts', 'meta'] as const;
export type Table = (typeof ALL_TABLES)[number];

export type AnyRecord = City | Category | Entry | Visit | ImageMeta;

export interface RowTypes {
  cities: City; categories: Category; entries: Entry; visits: Visit; images: ImageMeta;
  shares: Share; outbox: OutboxItem; conflicts: Conflict; meta: MetaRow;
}

export interface UserSession {
  mode: 'demo' | 'firebase';
  uid: string;
  email: string;
  name: string;
}
