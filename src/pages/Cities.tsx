import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Clock, Plus, Search, Users, X } from 'lucide-react';
import { alive, useTable } from '../data/db';
import { useSession } from '../auth/session';
import { CoverImage } from '../components/images';
import { RecordSync } from '../components/common';
import { CityForm } from '../components/forms';
import { Button, EmptyState } from '../components/ui';
import { timeAgo } from '../lib/util';

type Sort = 'recent' | 'az' | 'updated';

export default function Cities() {
  const { session } = useSession();
  const [params, setParams] = useSearchParams();
  const cities = alive(useTable('cities'));
  const entries = alive(useTable('entries'));
  const images = useTable('images');
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (params.get('new')) { setFormOpen(true); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const countries = useMemo(() => [...new Set(cities.map((c) => c.country).filter(Boolean))].sort(), [cities]);
  const states = useMemo(() => [...new Set(cities.filter((c) => !country || c.country === country).map((c) => c.state).filter(Boolean))].sort(), [cities, country]);

  const list = cities
    .filter((c) => (!country || c.country === country) && (!state || c.state === state))
    .filter((c) => !q || `${c.name} ${c.state} ${c.country}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sort === 'az' ? a.name.localeCompare(b.name) : sort === 'updated' ? b.updatedAt - a.updatedAt : (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0));
  const filtered = q || country || state;

  return (
    <div className="animate-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Cities</h1>
          <p className="text-sm text-muted">{cities.length} cit{cities.length === 1 ? 'y' : 'ies'} in your vault</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Add city</Button>
      </div>

      <div className="card mb-5 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Search cities…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cities" />
        </div>
        <select className="input sm:w-40" value={country} onChange={(e) => { setCountry(e.target.value); setState(''); }} aria-label="Filter by country">
          <option value="">All countries</option>{countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input sm:w-40" value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state">
          <option value="">All states</option>{states.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="recent">Recently visited</option><option value="az">Alphabetical (A–Z)</option><option value="updated">Recently updated</option>
        </select>
      </div>

      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const count = entries.filter((e) => e.cityId === c.id).length;
            const shared = c.ownerId !== session?.uid;
            return (
              <Link key={c.id} to={`/cities/${c.id}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative">
                  <CoverImage image={images.find((i) => i.id === c.coverImageId && !i.deletedAt)} className="h-36 transition duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 text-white">
                    <div className="text-xl font-extrabold tracking-tight drop-shadow">{c.name}</div>
                    <div className="text-xs text-white/85">{[c.state, c.country].filter(Boolean).join(', ') || '—'}</div>
                  </div>
                  {shared && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-brand-700"><Users className="h-3 w-3" />Shared</span>}
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-xs text-muted">
                  <span className="font-semibold text-ink">{count} entr{count === 1 ? 'y' : 'ies'}</span>
                  <span className="flex items-center gap-2"><RecordSync status={c.syncStatus} /><Clock className="h-3.5 w-3.5" />{c.lastVisitedAt ? timeAgo(c.lastVisitedAt) : 'No visits'}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : filtered ? (
        <div className="card"><EmptyState icon={<Search className="h-7 w-7" />} title="No matching cities" text="Try a different search or clear the filters." action={<Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => { setQ(''); setCountry(''); setState(''); }}>Clear filters</Button>} /></div>
      ) : (
        <div className="card"><EmptyState icon={<Building2 className="h-7 w-7" />} title="No cities yet" text="Add a city you visit for business to start collecting knowledge." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Add your first city</Button>} /></div>
      )}

      {formOpen && <CityForm open onClose={() => setFormOpen(false)} />}
    </div>
  );
}
