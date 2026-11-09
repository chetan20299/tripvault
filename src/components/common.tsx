import {
  Briefcase, Utensils, ShoppingBag, Landmark, Phone, BedDouble, Car, BarChart3, Lightbulb, StickyNote, Plane, Coffee, Building2, Users,
  Heart, Star, MapPin, Camera, Wrench, GraduationCap, Stethoscope, Dumbbell, Gift, Globe, Ticket, Music, Train, Wallet,
  CloudOff, RefreshCw, AlertCircle, CheckCircle2, CircleDashed, GitMerge, type LucideIcon,
} from 'lucide-react';
import type { Category, SyncStatus } from '../types';
import { cn, timeAgo } from '../lib/util';
import { useSyncState } from '../auth/session';
import { alive, useTable } from '../data/db';

export const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, utensils: Utensils, 'shopping-bag': ShoppingBag, landmark: Landmark, phone: Phone, bed: BedDouble, car: Car,
  chart: BarChart3, lightbulb: Lightbulb, note: StickyNote, plane: Plane, coffee: Coffee, building: Building2, users: Users, heart: Heart,
  star: Star, pin: MapPin, camera: Camera, wrench: Wrench, education: GraduationCap, health: Stethoscope, gym: Dumbbell, gift: Gift,
  globe: Globe, ticket: Ticket, music: Music, train: Train, wallet: Wallet,
};
export const COLORS = ['#0B4F6C', '#1C7ED6', '#0CA678', '#2F9E44', '#F59F00', '#E8590C', '#E03131', '#C2255C', '#AE3EC9', '#6741D9', '#495057', '#868E96'];

export function CategoryIcon({ category, size = 'md' }: { category?: Pick<Category, 'icon' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  const I = ICONS[category?.icon ?? 'note'] ?? StickyNote;
  const color = category?.color ?? '#868E96';
  const box = size === 'sm' ? 'h-7 w-7 rounded-lg' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-9 w-9 rounded-xl';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-6 w-6' : 'h-[18px] w-[18px]';
  return (
    <span className={cn('grid shrink-0 place-items-center', box)} style={{ backgroundColor: `${color}1f`, color }}>
      <I className={icon} />
    </span>
  );
}

/** Per-record sync dot (only shown when not synced). */
export function RecordSync({ status }: { status: SyncStatus }) {
  if (status === 'synced') return null;
  const map = {
    pending: ['Pending sync', 'bg-accent-500'], syncing: ['Syncing', 'bg-brand-400'], failed: ['Sync failed', 'bg-red-500'], conflict: ['Needs review', 'bg-fuchsia-500'],
  } as const;
  const [label, color] = map[status];
  return <span title={label} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted"><span className={cn('h-1.5 w-1.5 rounded-full', color)} />{label}</span>;
}

/** Global sync indicator: Synced / Pending / Syncing / Failed / Offline / Conflicts. */
export function SyncBadge({ onClick, compact }: { onClick?: () => void; compact?: boolean }) {
  const s = useSyncState();
  const pending = useTable('outbox').length;
  const conflicts = useTable('conflicts').length;
  let I: LucideIcon = CheckCircle2, label = 'Synced', tone = 'text-emerald-600 bg-emerald-500/10';
  if (s.status === 'offline') { I = CloudOff; label = pending ? `Offline · ${pending} pending` : 'Offline'; tone = 'text-slate-600 bg-slate-500/10 dark:text-slate-300'; }
  else if (s.status === 'syncing') { I = RefreshCw; label = s.progress?.total ? `Syncing ${s.progress.done}/${s.progress.total}` : 'Syncing'; tone = 'text-brand-600 bg-brand-500/10 dark:text-brand-200'; }
  else if (conflicts) { I = GitMerge; label = `${conflicts} to review`; tone = 'text-fuchsia-600 bg-fuchsia-500/10'; }
  else if (s.status === 'error') { I = AlertCircle; label = 'Sync failed'; tone = 'text-red-600 bg-red-500/10'; }
  else if (pending) { I = CircleDashed; label = `${pending} pending`; tone = 'text-accent-600 bg-accent-500/10'; }
  return (
    <button onClick={onClick} title={`Last synced ${timeAgo(s.lastSyncAt)}${s.lastError ? ` — ${s.lastError}` : ''}`}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition hover:brightness-95', tone)}>
      <I className={cn('h-3.5 w-3.5', s.status === 'syncing' && 'animate-spin')} />
      {!compact && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}

export function useCategories() {
  return alive(useTable('categories')).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

