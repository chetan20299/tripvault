import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile, type Auth, type User,
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, runTransaction, serverTimestamp,
  Timestamp, writeBatch, type Firestore,
} from 'firebase/firestore';
import { getStorage, ref as sref, uploadBytes, getBlob, deleteObject } from 'firebase/storage';
import { firebaseConfig, IMAGE_BACKEND } from '../config';
import { SYNCED_TABLES, type AnyRecord, type City, type ImageMeta, type Share, type SyncedTable } from '../types';
import { OfflineError, decide, toRemote, type PullResult, type PushResult, type RemoteBackend } from './remote';
import { blobToBase64, base64ToBlob } from '../lib/util';

let app: FirebaseApp | null = null;
let auth: Auth;
let fs: Firestore;

/** Lazily initialised — Demo Mode never loads or touches Firebase. */
export function fb() {
  if (!app) {
    app = initializeApp(firebaseConfig as Record<string, string>);
    // Explicit persistence: getAuth() can hang inside Capacitor's iOS WebView.
    auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    fs = getFirestore(app);
  }
  return { app, auth, fs };
}

// ---- auth --------------------------------------------------------------------------------
export function waitForUser(): Promise<User | null> {
  const { auth } = fb();
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}

export async function fbLogin(email: string, password: string) {
  return (await signInWithEmailAndPassword(fb().auth, email.trim(), password)).user;
}

export async function fbRegister(name: string, email: string, password: string) {
  const { auth, fs } = fb();
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(user, { displayName: name });
  const emailLower = user.email!.toLowerCase();
  await Promise.all([
    setDoc(doc(fs, 'users', user.uid), { name, email: emailLower, createdAt: serverTimestamp() }),
    setDoc(doc(fs, 'userDirectory', emailLower), { uid: user.uid, name }),
  ]);
  return user;
}

export const fbLogout = () => signOut(fb().auth);
export const fbResetPassword = (email: string) => sendPasswordResetEmail(fb().auth, email.trim());

/** Maps Firebase error codes to readable messages. */
export function authError(e: any): string {
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/network-request-failed': 'No internet connection. Connect to sign in for the first time.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  };
  return map[e?.code] ?? e?.message ?? 'Something went wrong.';
}

// ---- sync backend ------------------------------------------------------------------------
const CHUNK = 700_000; // base64 chars per Firestore doc (limit is 1 MiB)
const OVERLAP_MS = 5 * 60_000; // re-read a little history so commit-order skew never drops a change

const isNetworkError = (e: any) => ['unavailable', 'deadline-exceeded', 'storage/retry-limit-exceeded'].includes(e?.code) || /network|offline/i.test(e?.message ?? '');

export class FirebaseRemote implements RemoteBackend {
  constructor(private uid: string) {}

  isOnline() { return navigator.onLine; }

  private col(owner: string, table: SyncedTable) { return collection(fb().fs, 'users', owner, table); }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isOnline()) throw new OfflineError();
    try { return await fn(); }
    catch (e: any) {
      if (isNetworkError(e)) throw new OfflineError();
      if (e?.code === 'permission-denied') throw new Error('Permission denied by server rules');
      throw e;
    }
  }

  push(table: SyncedTable, rec: AnyRecord): Promise<PushResult> {
    return this.guard(async () => {
      const { fs } = fb();
      const ref = doc(fs, 'users', rec.ownerId, table, rec.id);
      const result = await runTransaction(fs, async (t) => {
        const snap = await t.get(ref);
        const cur = snap.exists() ? fromFs(snap.data()) : undefined;
        const d = decide(cur, rec);
        if (d === 'conflict') return { ok: false, conflict: cur as AnyRecord } as const;
        if (d === 'already') return { ok: true, version: cur!.version } as const;
        t.set(ref, { ...toRemote(rec), version: rec.version + 1, serverUpdatedAt: serverTimestamp() });
        return { ok: true, version: rec.version + 1 } as const;
      });
      if (result.ok && table === 'images' && rec.deletedAt) await this.deleteImageBytes(rec as ImageMeta).catch(() => {});
      return result;
    });
  }

  pull(cursors: Record<string, any>): Promise<PullResult> {
    return this.guard(async () => {
      const { fs } = fb();
      const changes: PullResult['changes'] = [];
      const next: Record<string, any> = {};
      const since = (key: string) => Timestamp.fromMillis(Math.max(0, (cursors[key] ?? 0) - OVERLAP_MS));
      // Cursors use the server's clock (max serverUpdatedAt seen), never the device clock.
      const collect = (key: string, table: SyncedTable, docs: { data(): Record<string, any> }[]) => {
        let max = cursors[key] ?? 0;
        for (const d of docs) {
          const data = d.data();
          max = Math.max(max, data.serverUpdatedAt?.toMillis?.() ?? 0);
          changes.push({ table, rec: fromFs(data) as AnyRecord });
        }
        next[key] = Math.max(next[key] ?? 0, max);
      };

      for (const table of SYNCED_TABLES) {
        collect(table, table, (await getDocs(query(this.col(this.uid, table), where('serverUpdatedAt', '>', since(table))))).docs);
      }

      const [owned, received] = await Promise.all([
        getDocs(query(collection(fs, 'shares'), where('ownerId', '==', this.uid))),
        getDocs(query(collection(fs, 'shares'), where('granteeUid', '==', this.uid))),
      ]);
      const shares = [...owned.docs, ...received.docs].map((d) => fromFs(d.data()) as Share);

      for (const s of received.docs.map((d) => d.data() as Share)) {
        const key = `share:${s.id}`; // new shares start at 0 → full history
        const city = await getDoc(doc(fs, 'users', s.ownerId, 'cities', s.cityId));
        if (city.exists()) changes.push({ table: 'cities', rec: fromFs(city.data()) as AnyRecord });
        for (const table of ['entries', 'visits', 'images'] as const) {
          collect(key, table, (await getDocs(query(this.col(s.ownerId, table), where('cityId', '==', s.cityId), where('serverUpdatedAt', '>', since(key))))).docs);
        }
      }
      return { changes, shares, cursors: next };
    });
  }

  uploadImage(meta: ImageMeta, blob: Blob): Promise<string> {
    return this.guard(async () => {
      if (IMAGE_BACKEND === 'storage') {
        const path = `users/${meta.ownerId}/cities/${meta.cityId}/images/${meta.id}`; // cityId in path lets storage.rules check shares
        await uploadBytes(sref(getStorage(fb().app), path), blob, { contentType: blob.type });
        return `storage:${path}`;
      }
      const b64 = await blobToBase64(blob);
      const batch = writeBatch(fb().fs);
      const count = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < count; i++) {
        batch.set(doc(fb().fs, 'users', meta.ownerId, 'images', meta.id, 'chunks', String(i)), { cityId: meta.cityId, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
      }
      await batch.commit();
      return `chunks:${count}`;
    });
  }

  downloadImage(meta: ImageMeta): Promise<Blob> {
    return this.guard(async () => {
      const ref = meta.remoteRef ?? '';
      if (ref.startsWith('storage:')) return getBlob(sref(getStorage(fb().app), ref.slice(8)));
      const count = Number(ref.split(':')[1] ?? 0);
      const parts = await Promise.all(Array.from({ length: count }, (_, i) => getDoc(doc(fb().fs, 'users', meta.ownerId, 'images', meta.id, 'chunks', String(i)))));
      if (parts.some((p) => !p.exists())) throw new Error('Image data incomplete on server');
      return base64ToBlob(parts.map((p) => p.data()!.data).join(''), meta.mime);
    });
  }

  private async deleteImageBytes(meta: ImageMeta) {
    const ref = meta.remoteRef ?? '';
    if (ref.startsWith('storage:')) return deleteObject(sref(getStorage(fb().app), ref.slice(8)));
    const count = Number(ref.split(':')[1] ?? 0);
    const batch = writeBatch(fb().fs);
    for (let i = 0; i < count; i++) batch.delete(doc(fb().fs, 'users', meta.ownerId, 'images', meta.id, 'chunks', String(i)));
    await batch.commit();
  }

  shareCity(city: City, email: string, role: Share['role'], ownerName: string): Promise<Share> {
    return this.guard(async () => {
      const { fs } = fb();
      const emailLower = email.trim().toLowerCase();
      const dir = await getDoc(doc(fs, 'userDirectory', emailLower));
      if (!dir.exists()) throw new Error(`No TripVault account found for ${email}. Ask them to register first.`);
      const granteeUid = dir.data().uid as string;
      if (granteeUid === this.uid) throw new Error('You cannot share a city with yourself');
      const share: Share = { id: `${city.ownerId}_${city.id}_${granteeUid}`, ownerId: city.ownerId, cityId: city.id, granteeUid, granteeEmail: emailLower, ownerName, role, createdAt: Date.now() };
      await setDoc(doc(fs, 'shares', share.id), share);
      return share;
    });
  }

  revokeShare(share: Share) {
    return this.guard(() => deleteDoc(doc(fb().fs, 'shares', share.id)));
  }
}

/** Firestore Timestamps → ms numbers; drops server-only fields. */
function fromFs(data: Record<string, any>): Record<string, any> {
  const { serverUpdatedAt: _s, ...rest } = data;
  return rest;
}
