import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CloudOff, Database, FlaskConical, GitMerge, HardDrive, LogOut, Monitor, Moon, RefreshCw, RotateCcw, Sun, Tags, Trash2, User, Wifi } from 'lucide-react';
import { useSession, useSyncState } from '../auth/session';
import { getDB, useTable } from '../data/db';
import { DEFAULT_SYNC_SETTINGS, type SyncSettings } from '../sync/engine';
import { getSim, setSim, type DemoRemote } from '../sync/demoRemote';
import { Button, useUi } from '../components/ui';
import { useTheme, type Theme } from '../lib/theme';
import { cn, errMsg, fmtBytes, timeAgo } from '../lib/util';
import type { AnyRecord, Conflict } from '../types';

export default function Settings() {
  const { session, engine, logout, resetDemo, clearLocalData } = useSession();
  const sync = useSyncState();
  const { toast, confirm } = useUi();
  const nav = useNavigate();
  const { hash } = useLocation();
  const [theme, setTheme] = useTheme();
  const outbox = useTable('outbox');
  const conflicts = useTable('conflicts');
  const meta = useTable('meta');
  const counts = { cities: useTable('cities').length, entries: useTable('entries').length, images: useTable('images').length };
  const settings: SyncSettings = { ...DEFAULT_SYNC_SETTINGS, ...(meta.find((m) => m.id === 'syncSettings')?.value as object) };
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [sim, setSimState] = useState(getSim());
  const failed = outbox.filter((o) => o.lastError);
  const isDemo = session?.mode === 'demo';

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      setStorage({ usage: est?.usage, quota: est?.quota, persisted: await navigator.storage?.persisted?.().catch(() => undefined) });
    })();
  }, [counts.images]);
  useEffect(() => { if (hash === '#sync') document.getElementById('sync')?.scrollIntoView({ behavior: 'smooth' }); }, [hash]);

  const setSetting = (patch: Partial<SyncSettings>) => getDB().setMeta('syncSettings', { ...settings, ...patch });
  const updSim = (patch: Parameters<typeof setSim>[0]) => { setSim(patch); setSimState(getSim()); if (patch.offline === false) engine?.syncNow(); };

  async function doLogout() {
    if (outbox.length) {
      const r = await confirm({
        title: `${outbox.length} change(s) not synced yet`,
        text: engine?.remote.isOnline() ? 'Sync now before logging out? If you log out anyway, the changes stay safely on this device and sync the next time you sign in here.' : "You're offline. Your changes stay safely on this device and will sync the next time you sign in here.",
        confirmLabel: 'Log out anyway', danger: true,
        extra: engine?.remote.isOnline() ? { label: 'Sync & log out', value: 'sync' } : undefined,
      });
      if (!r) return;
      if (r === 'sync') {
        await engine!.syncNow();
        if (getDB().all('outbox').length) return toast('Some changes could not sync. Please review them before logging out.', 'error');
      }
    }
    await logout();
  }

  async function doClear() {
    const ok = await confirm({
      title: 'Clear local data?',
      text: outbox.length ? `⚠ ${outbox.length} unsynced change(s) will be permanently lost. This removes all TripVault data from this device and signs you out.` : 'This removes TripVault data from this device and signs you out. Your synced data stays in the cloud.',
      confirmLabel: 'Clear data', danger: true,
    });
    if (ok) await clearLocalData();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-in">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>

      <Section icon={User} title="Profile">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-xl font-bold text-white">{session?.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
          <div className="min-w-0 flex-1">
            <div className="font-bold">{session?.name}</div>
            <div className="truncate text-sm text-muted">{session?.email}</div>
            <span className={cn('chip mt-1', isDemo ? '!bg-accent-500/10 !text-accent-600' : '!bg-emerald-500/10 !text-emerald-600')}>{isDemo ? 'Demo Mode' : 'Cloud account'}</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" className="mt-4" icon={<Tags className="h-4 w-4" />} onClick={() => nav('/categories')}>Manage categories</Button>
      </Section>

      <Section icon={Sun} title="Appearance">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-elevated p-1">
          {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']] as [Theme, any, string][]).map(([k, I, l]) => (
            <button key={k} onClick={() => setTheme(k)} className={cn('flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition', theme === k ? 'bg-surface shadow-sm' : 'text-muted')}><I className="h-4 w-4" />{l}</button>
          ))}
        </div>
      </Section>

      <Section icon={RefreshCw} title="Sync" id="sync">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Status" value={sync.status === 'idle' ? (outbox.length ? 'Pending' : 'Synced') : sync.status === 'error' ? 'Failed' : sync.status[0].toUpperCase() + sync.status.slice(1)} />
          <Stat label="Pending" value={outbox.length} />
          <Stat label="Last sync" value={timeAgo(sync.lastSyncAt)} />
        </div>
        {sync.lastError && <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{sync.lastError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={<RefreshCw className={cn('h-4 w-4', sync.status === 'syncing' && 'animate-spin')} />} disabled={sync.status === 'syncing'} onClick={async () => { await engine?.syncNow(); toast(engine?.state.status === 'offline' ? "You're offline. Changes will sync when you reconnect." : engine?.state.lastError ?? 'Sync complete', engine?.state.status === 'idle' ? 'success' : 'warning'); }}>Sync now</Button>
          {failed.length > 0 && <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => engine?.retryFailed()}>Retry failed ({failed.length})</Button>}
        </div>
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <Toggle label="Automatic sync" hint="Sync in the background whenever you're online" checked={settings.autoSync} onChange={(v) => setSetting({ autoSync: v })} />
          <Toggle label="Download images for offline use" hint="Keeps photos from other devices available without internet" checked={settings.downloadImages} onChange={(v) => setSetting({ downloadImages: v })} />
        </div>
        {failed.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-bold">Failed items</h3>
            <ul className="space-y-1.5 text-sm">{failed.map((o) => <li key={o.id} className="rounded-lg bg-elevated px-3 py-2"><span className="font-medium">{labelOf(getDB().get(o.table, o.recordId) as AnyRecord | undefined, o.table)}</span><span className="block text-xs text-muted">{o.lastError} · attempt {o.attempts}</span></li>)}</ul>
          </div>
        )}
        {conflicts.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-bold"><GitMerge className="h-4 w-4 text-fuchsia-500" />Needs your review ({conflicts.length})</h3>
            <p className="mb-3 text-xs text-muted">These records were changed on another device while you also changed them. Nothing was overwritten. Choose which version to keep.</p>
            <div className="space-y-3">{conflicts.map((c) => <ConflictCard key={c.id} c={c} />)}</div>
          </div>
        )}
      </Section>

      {isDemo && (
        <Section icon={FlaskConical} title="Demo simulator" tone="accent">
          <p className="mb-4 text-sm text-muted">Test offline and sync behaviour safely. All demo data stays in this browser and never touches Firebase.</p>
          <div className="space-y-4">
            <Toggle label={<span className="flex items-center gap-2">{sim.offline ? <CloudOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}Simulate offline</span>} hint="Make changes, then turn this off to watch them sync" checked={sim.offline} onChange={(v) => updSim({ offline: v })} />
            <label className="block">
              <span className="flex justify-between text-sm font-semibold"><span>Simulated server failure rate</span><span className="text-muted">{Math.round(sim.failRate * 100)}%</span></span>
              <input type="range" min={0} max={1} step={0.1} value={sim.failRate} onChange={(e) => updSim({ failRate: Number(e.target.value) })} className="mt-2 w-full accent-accent-500" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={async () => {
                try {
                  const title = await (engine!.remote as DemoRemote).simulateRemoteEdit();
                  toast(title ? `"${title}" was edited on another device. Sync to pull it (edit it locally first to create a conflict).` : 'No entries to edit', 'info');
                } catch (e) { toast(errMsg(e), 'error'); }
              }}>Simulate edit from another device</Button>
              <Button variant="danger" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: 'Reset demo data?', text: 'All demo changes will be discarded and the sample data restored.', confirmLabel: 'Reset', danger: true })) { await resetDemo(); nav('/'); toast('Demo data reset'); } }}>Reset demo data</Button>
            </div>
          </div>
        </Section>
      )}

      <Section icon={HardDrive} title="Storage & offline data">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Cities" value={counts.cities} /><Stat label="Entries" value={counts.entries} /><Stat label="Images" value={counts.images} />
        </div>
        {storage.usage !== undefined && (
          <div className="mt-4">
            <div className="flex justify-between text-sm"><span className="text-muted">Device storage used</span><span className="font-semibold">{fmtBytes(storage.usage)}{storage.quota ? ` of ${fmtBytes(storage.quota)}` : ''}</span></div>
            {storage.quota ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(1, (storage.usage / storage.quota) * 100)}%` }} /></div> : null}
            <p className="mt-2 text-xs text-muted">{storage.persisted ? 'Storage is persistent: the browser will not clear it automatically.' : 'Tip: install TripVault (Add to Home Screen) so the browser keeps your offline data.'}</p>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div><div className="flex items-center gap-1.5 text-sm font-semibold"><Database className="h-4 w-4" />Clear local data</div><div className="text-xs text-muted">Remove all TripVault data from this device</div></div>
          <Button variant="secondary" size="sm" icon={<Trash2 className="h-4 w-4 text-red-500" />} onClick={doClear}>Clear</Button>
        </div>
      </Section>

      <Button variant="secondary" className="w-full !text-red-600" icon={<LogOut className="h-4 w-4" />} onClick={doLogout}>Log out</Button>
      <p className="pb-4 text-center text-xs text-muted">TripVault v1.0 · Your Business Travel Knowledge</p>
    </div>
  );
}

const IGNORED = new Set(['id', 'ownerId', 'createdAt', 'updatedAt', 'version', 'syncStatus', 'lastSyncedAt']);
const labelOf = (r: AnyRecord | undefined, table: string) => (r ? (r as any).title || (r as any).name || (r as any).purpose || table : `Deleted ${table} item`);
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? (v.length ? v.map((x) => (typeof x === 'object' ? `${x.label}: ${x.value}` : x)).join(', ') : '—') : String(v));

function ConflictCard({ c }: { c: Conflict }) {
  const { engine } = useSession();
  const { toast } = useUi();
  const local = (getDB().get(c.table, c.recordId) as AnyRecord | undefined) ?? c.local;
  const fields = Object.keys({ ...local, ...c.remote }).filter((k) => !IGNORED.has(k) && JSON.stringify((local as any)[k]) !== JSON.stringify((c.remote as any)[k]));
  const resolve = async (choice: 'mine' | 'theirs') => { await engine?.resolveConflict(c.id, choice); toast(choice === 'mine' ? 'Kept your version, syncing…' : 'Kept the other version'); };
  return (
    <div className="rounded-xl border border-fuchsia-500/30 p-3">
      <div className="mb-2 text-sm font-bold">{labelOf(local, c.table)} <span className="font-normal text-muted">· {c.table}</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted"><tr><th className="py-1 pr-2">Field</th><th className="py-1 pr-2">This device</th><th className="py-1">Other device</th></tr></thead>
          <tbody>{fields.map((k) => <tr key={k} className="border-t border-line align-top"><td className="py-1.5 pr-2 font-semibold">{k === 'deletedAt' ? 'deleted' : k}</td><td className="whitespace-pre-wrap py-1.5 pr-2">{k === 'deletedAt' ? ((local as any)[k] ? 'Yes' : 'No') : show((local as any)[k])}</td><td className="whitespace-pre-wrap py-1.5">{k === 'deletedAt' ? ((c.remote as any)[k] ? 'Yes' : 'No') : show((c.remote as any)[k])}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => resolve('mine')}>Keep mine</Button><Button size="sm" variant="secondary" onClick={() => resolve('theirs')}>Keep theirs</Button></div>
    </div>
  );
}

function Section({ icon: I, title, children, id, tone }: { icon: any; title: string; children: ReactNode; id?: string; tone?: 'accent' }) {
  return (
    <section id={id} className={cn('card scroll-mt-20 p-5', tone === 'accent' && 'border-accent-500/40')}>
      <h2 className="mb-4 flex items-center gap-2 font-bold"><I className={cn('h-[18px] w-[18px]', tone === 'accent' ? 'text-accent-500' : 'text-brand-500')} />{title}</h2>
      {children}
    </section>
  );
}
const Stat = ({ label, value }: { label: string; value: ReactNode }) => <div className="rounded-xl bg-elevated/70 p-3"><div className="truncate text-base font-bold">{value}</div><div className="text-[11px] font-medium text-muted">{label}</div></div>;

function Toggle({ label, hint, checked, onChange }: { label: ReactNode; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-line')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}
