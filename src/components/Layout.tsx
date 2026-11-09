import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, FileDown, LayoutDashboard, Plus, Settings, Tags, WifiOff, FlaskConical } from 'lucide-react';
import { Logo } from './ui';
import { SyncBadge } from './common';
import { useSession, useSyncState } from '../auth/session';
import { cn } from '../lib/util';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/cities', label: 'Cities', icon: Building2 },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/export', label: 'Export & Share', icon: FileDown },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const nav = useNavigate();
  const { session } = useSession();
  const sync = useSyncState();
  const goSync = () => nav('/settings#sync');

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <Logo className="px-2" />
        <button onClick={() => nav('/entry/new')} className="mt-7 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
          <Plus className="h-4 w-4" /> New entry
        </button>
        <nav className="mt-6 space-y-1">
          {NAV.map(({ to, label, icon: I, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100' : 'text-muted hover:bg-elevated hover:text-ink')}>
              <I className="h-[18px] w-[18px]" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {session?.mode === 'demo' && <div className="flex items-center gap-2 rounded-xl bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-600"><FlaskConical className="h-4 w-4" />Demo Mode — local data only</div>}
          <div className="flex items-center justify-between rounded-xl bg-elevated px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{session?.name}</div>
              <div className="truncate text-xs text-muted">{session?.email}</div>
            </div>
          </div>
          <SyncBadge onClick={goSync} />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="safe-top sticky top-0 z-20 border-b border-line/70 bg-surface/85 backdrop-blur-lg lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Logo size={30} withText={false} className="[&>img]:rounded-lg" />
          <div className="absolute left-1/2 -translate-x-1/2 text-[15px] font-extrabold tracking-tight">Trip<span className="text-brand-500">Vault</span></div>
          <SyncBadge onClick={goSync} compact={sync.status === 'idle'} />
        </div>
      </header>

      {sync.status === 'offline' && (
        <div className="flex items-center justify-center gap-2 bg-slate-800 px-4 py-1.5 text-xs font-medium text-white dark:bg-slate-700">
          <WifiOff className="h-3.5 w-3.5" /> You're offline. Changes are saved on this device and will sync automatically.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-lg lg:hidden">
        <div className="grid h-16 grid-cols-5 items-center">
          {[NAV[0], NAV[1]].map(Item)}
          <div className="flex justify-center">
            <button onClick={() => nav('/entry/new')} aria-label="New entry" className="-mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-900/30 transition active:scale-95">
              <Plus className="h-6 w-6" />
            </button>
          </div>
          {[NAV[3], NAV[4]].map(Item)}
        </div>
      </nav>
    </div>
  );
}

function Item({ to, label, icon: I, end }: (typeof NAV)[number]) {
  return (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex flex-col items-center gap-1 text-[10.5px] font-semibold', isActive ? 'text-brand-600 dark:text-brand-200' : 'text-muted')}>
      <I className="h-5 w-5" /> {label.split(' ')[0]}
    </NavLink>
  );
}
