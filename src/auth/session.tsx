import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { UserSession } from '../types';
import { DB, setCurrentDB } from '../data/db';
import { openStore } from '../data/store';
import { initRepo, seedDefaultCategories } from '../data/repo';
import { SyncEngine, type EngineState } from '../sync/engine';
import { DemoRemote, DEMO_USERS, setSim } from '../sync/demoRemote';
import { FIREBASE_ENABLED, OFFLINE_SESSION_DAYS } from '../config';

const SESSION_KEY = 'tv.session';
interface Stored extends UserSession { lastOnlineAuthAt: number }

const readStored = (): Stored | null => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
};

interface Ctx {
  status: 'loading' | 'signedOut' | 'ready';
  session: UserSession | null;
  engine: SyncEngine | null;
  notice: string | null;
  loginDemo(): Promise<void>;
  loginFirebase(email: string, password: string): Promise<void>;
  registerFirebase(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  resetDemo(): Promise<void>;
  clearLocalData(): Promise<void>;
}
const SessionCtx = createContext<Ctx>(null as any);
export const useSession = () => useContext(SessionCtx);

let active: { db: DB; engine: SyncEngine; remote: { close?: () => void } } | null = null;

async function open(s: UserSession): Promise<SyncEngine> {
  const db = await DB.open(await openStore(`tripvault-${s.mode === 'demo' ? 'demo' : s.uid}`), s.uid);
  setCurrentDB(db);
  await seedDefaultCategories(db, s.uid);
  let remote;
  if (s.mode === 'demo') {
    remote = await DemoRemote.open(s.uid);
    if (!db.meta('demoSeeded')) {
      const { seedDemo } = await import('../data/demoSeed');
      await seedDemo(db, remote);
      await db.setMeta('demoSeeded', Date.now());
    }
  } else {
    const { FirebaseRemote } = await import('../sync/firebase');
    remote = new FirebaseRemote(s.uid);
  }
  const engine = new SyncEngine(db, remote, s.uid);
  initRepo(s.uid, () => engine.schedule());
  engine.start();
  active = { db, engine, remote: remote as any };
  navigator.storage?.persist?.().catch(() => {});
  return engine;
}

async function close(destroy = false) {
  if (!active) return;
  active.engine.stop();
  active.remote.close?.();
  setCurrentDB(null);
  if (destroy) await active.db.store.destroy();
  else await active.db.store.close();
  active = null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Ctx['status']; session: UserSession | null; engine: SyncEngine | null; notice: string | null }>({ status: 'loading', session: null, engine: null, notice: null });

  const start = useCallback(async (s: UserSession, freshAuth: boolean) => {
    const prev = readStored();
    const stored: Stored = { ...s, lastOnlineAuthAt: freshAuth ? Date.now() : prev?.lastOnlineAuthAt ?? Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    const engine = await open(s);
    setState({ status: 'ready', session: s, engine, notice: null });
  }, []);

  // Restore session on launch (works offline).
  useEffect(() => {
    (async () => {
      const stored = readStored();
      try {
        if (stored?.mode === 'demo') { await start(stored, false); }
        else if (stored?.mode === 'firebase' && FIREBASE_ENABLED) {
          const { waitForUser } = await import('../sync/firebase');
          const user = await waitForUser();
          const expired = Date.now() - stored.lastOnlineAuthAt > OFFLINE_SESSION_DAYS * 86_400_000;
          if (user && (navigator.onLine || !expired)) await start({ mode: 'firebase', uid: user.uid, email: user.email ?? '', name: user.displayName ?? stored.name }, navigator.onLine);
          else setState((p) => ({ ...p, status: 'signedOut', notice: user && expired ? `For security, please sign in again (offline access is limited to ${OFFLINE_SESSION_DAYS} days). Your local data is kept.` : null }));
        } else setState((p) => ({ ...p, status: 'signedOut' }));
      } catch (e) {
        console.error(e);
        setState((p) => ({ ...p, status: 'signedOut', notice: 'Could not open local data. Please sign in again.' }));
      }
    })();
  }, [start]);

  const ctx: Ctx = {
    ...state,
    async loginDemo() {
      const u = DEMO_USERS[0];
      await start({ mode: 'demo', uid: u.uid, email: u.email, name: u.name }, true);
    },
    async loginFirebase(email, password) {
      const { fbLogin } = await import('../sync/firebase');
      const u = await fbLogin(email, password);
      await start({ mode: 'firebase', uid: u.uid, email: u.email ?? email, name: u.displayName ?? email.split('@')[0] }, true);
    },
    async registerFirebase(name, email, password) {
      const { fbRegister } = await import('../sync/firebase');
      const u = await fbRegister(name, email, password);
      await start({ mode: 'firebase', uid: u.uid, email: u.email ?? email, name }, true);
    },
    async logout() {
      const mode = state.session?.mode;
      await close();
      if (mode === 'firebase') await (await import('../sync/firebase')).fbLogout().catch(() => {});
      localStorage.removeItem(SESSION_KEY);
      setState({ status: 'signedOut', session: null, engine: null, notice: null });
    },
    async resetDemo() {
      await close(true);
      await DemoRemote.destroy();
      setSim({ offline: false, failRate: 0 });
      await ctx.loginDemo();
    },
    async clearLocalData() {
      const mode = state.session?.mode;
      await close(true);
      if (mode === 'firebase') await (await import('../sync/firebase')).fbLogout().catch(() => {});
      localStorage.removeItem(SESSION_KEY);
      setState({ status: 'signedOut', session: null, engine: null, notice: 'Local data cleared from this device.' });
    },
  };

  return <SessionCtx.Provider value={ctx}>{children}</SessionCtx.Provider>;
}

const IDLE: EngineState = { status: 'idle', lastSyncAt: null, lastError: null, progress: null };
export function useSyncState(): EngineState {
  const { engine } = useSession();
  return useSyncExternalStore(engine?.subscribe ?? (() => () => {}), () => engine?.state ?? IDLE);
}
