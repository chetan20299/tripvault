import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Building2, CircleDashed, Clock, FileDown, MapPin, Phone, Plus, Tags, Landmark } from 'lucide-react';
import { alive, useTable } from '../data/db';
import { useSession } from '../auth/session';
import { CategoryIcon, RecordSync, useCategories } from '../components/common';
import { CoverImage } from '../components/images';
import { EmptyState, Button } from '../components/ui';
import { cityLabel } from '../data/repo';
import { timeAgo } from '../lib/util';

export default function Dashboard() {
  const nav = useNavigate();
  const { session } = useSession();
  const cities = alive(useTable('cities'));
  const entries = alive(useTable('entries'));
  const images = useTable('images');
  const pending = useTable('outbox').length;
  const categories = useCategories();
  const catOf = (id: string) => categories.find((c) => c.id === id);
  const cityOf = (id: string) => cities.find((c) => c.id === id);

  const stats = [
    { label: 'Cities saved', value: cities.length, icon: Building2, tone: 'from-brand-500 to-brand-700', to: '/cities' },
    { label: 'Business leads', value: entries.filter((e) => e.categoryId === 'leads').length, icon: Briefcase, tone: 'from-sky-500 to-blue-700' },
    { label: 'Contacts', value: entries.filter((e) => e.categoryId === 'contacts' || e.phone || e.email).length, icon: Phone, tone: 'from-emerald-500 to-teal-700' },
    { label: 'Places saved', value: entries.filter((e) => ['places', 'food', 'shops', 'hotels'].includes(e.categoryId)).length, icon: Landmark, tone: 'from-amber-500 to-orange-600' },
  ];
  const recentEntries = [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const recentCities = [...cities].filter((c) => c.lastVisitedAt).sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0)).slice(0, 4);
  const hour = new Date().getHours();

  return (
    <div className="space-y-7 animate-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'},</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{session?.name.split(' ')[0]} 👋</h1>
        </div>
        {pending > 0 && <Link to="/settings#sync" className="chip !bg-accent-500/10 !text-accent-600"><CircleDashed className="h-3.5 w-3.5" />{pending} change{pending > 1 ? 's' : ''} waiting to sync</Link>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: I, tone, to }) => (
          <button key={label} onClick={() => nav(to ?? '/cities')} className="card group p-4 text-left transition hover:-translate-y-0.5">
            <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-sm`}><I className="h-5 w-5" /></div>
            <div className="text-2xl font-extrabold tracking-tight">{value}</div>
            <div className="text-xs font-medium text-muted">{label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'New entry', icon: Plus, to: '/entry/new', primary: true },
          { label: 'Add city', icon: MapPin, to: '/cities?new=1' },
          { label: 'Categories', icon: Tags, to: '/categories' },
          { label: 'Export PDF', icon: FileDown, to: '/export' },
        ].map(({ label, icon: I, to, primary }) => (
          <Button key={label} variant={primary ? 'primary' : 'secondary'} icon={<I className="h-4 w-4" />} onClick={() => nav(to)}>{label}</Button>
        ))}
      </div>

      {!cities.length ? (
        <div className="card"><EmptyState icon={<Building2 className="h-7 w-7" />} title="Your vault is empty" text="Add the first city you've visited, then start saving leads, places and contacts." action={<Button onClick={() => nav('/cities?new=1')} icon={<Plus className="h-4 w-4" />}>Add a city</Button>} /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <SectionTitle title="Recently added" />
            <div className="card divide-y divide-line">
              {recentEntries.length ? recentEntries.map((e) => (
                <Link key={e.id} to={`/entry/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-elevated/60">
                  <CategoryIcon category={catOf(e.categoryId)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{e.title}</div>
                    <div className="truncate text-xs text-muted">{cityOf(e.cityId)?.name ?? 'Shared city'} · {catOf(e.categoryId)?.name ?? 'Other'}</div>
                  </div>
                  <div className="text-right"><div className="text-xs text-muted">{timeAgo(e.updatedAt)}</div><RecordSync status={e.syncStatus} /></div>
                </Link>
              )) : <p className="p-6 text-center text-sm text-muted">No entries yet.</p>}
            </div>
          </section>
          <section className="lg:col-span-2">
            <SectionTitle title="Recently visited" link="/cities" />
            <div className="grid gap-3">
              {recentCities.map((c) => (
                <Link key={c.id} to={`/cities/${c.id}`} className="card flex items-center gap-3 overflow-hidden p-2 pr-4 transition hover:-translate-y-0.5">
                  <CoverImage image={images.find((i) => i.id === c.coverImageId && !i.deletedAt)} className="h-16 w-20 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{c.name}</div>
                    <div className="truncate text-xs text-muted">{cityLabel(c).split(', ').slice(1).join(', ')}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted"><Clock className="h-3 w-3" />{timeAgo(c.lastVisitedAt)}</div>
                  </div>
                  <span className="chip">{entries.filter((e) => e.cityId === c.id).length}</span>
                </Link>
              ))}
              {!recentCities.length && <p className="card p-6 text-center text-sm text-muted">Log a visit on a city to see it here.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function SectionTitle({ title, link }: { title: string; link?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      {link && <Link to={link} className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-200">View all</Link>}
    </div>
  );
}
