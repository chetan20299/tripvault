import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Edit3, FileDown, Images, MoreHorizontal, Pencil, Plus, Search, Share2, Trash2, Users, CalendarDays } from 'lucide-react';
import { alive, useTable } from '../data/db';
import { useSession } from '../auth/session';
import { CITY_TABS } from '../data/categories';
import { deleteCity, cityEntries, cityVisits, save } from '../data/repo';
import { CategoryIcon, RecordSync, useCategories } from '../components/common';
import { CoverImage, Gallery } from '../components/images';
import { EntryCard } from '../components/EntryCard';
import { CityForm, ShareModal, VisitForm } from '../components/forms';
import { Button, EmptyState, useUi } from '../components/ui';
import { cn, fmtDate } from '../lib/util';
import type { Entry, Visit } from '../types';

/** owner | editor | viewer — viewers get a read-only UI (server rules enforce it too). */
export function useAccess(ownerId: string | undefined, cityId: string | undefined): 'owner' | 'editor' | 'viewer' {
  const { session } = useSession();
  const shares = useTable('shares');
  if (!ownerId || ownerId === session?.uid) return 'owner';
  return shares.find((s) => s.cityId === cityId && s.granteeUid === session?.uid)?.role === 'editor' ? 'editor' : 'viewer';
}

export default function CityDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { toast, confirm } = useUi();
  const city = useTable('cities').find((c) => c.id === id && !c.deletedAt);
  const allEntries = useTable('entries');
  const allImages = useTable('images');
  const allVisits = useTable('visits');
  const shares = useTable('shares');
  const categories = useCategories();
  const access = useAccess(city?.ownerId, city?.id);
  const [tab, setTab] = useState('overview');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<'' | 'edit' | 'share' | 'visit'>('');
  const [editVisit, setEditVisit] = useState<Visit | undefined>();
  const [menu, setMenu] = useState(false);

  if (!city) return <div className="card"><EmptyState icon={<Search className="h-7 w-7" />} title="City not found" text="It may have been deleted or is no longer shared with you." action={<Button onClick={() => nav('/cities')}>Back to cities</Button>} /></div>;

  const entries = cityEntries(allEntries, city.id);
  const images = alive(allImages).filter((i) => i.cityId === city.id);
  const visits = cityVisits(allVisits, city.id);
  const catOf = (cid: string) => categories.find((c) => c.id === cid);
  const canEdit = access !== 'viewer';
  const sharedWith = shares.filter((s) => s.cityId === city.id && s.ownerId === city.ownerId).length;
  const owner = shares.find((s) => s.cityId === city.id && s.ownerId === city.ownerId);

  const coveredIds = CITY_TABS.flatMap((t) => t.categoryIds ?? []).concat('contacts');
  const tabEntries = (key: string): Entry[] => {
    const t = CITY_TABS.find((x) => x.key === key)!;
    if (key === 'contacts') return entries.filter((e) => e.categoryId === 'contacts' || e.phone || e.email);
    if (key === 'notes') return entries.filter((e) => !coveredIds.includes(e.categoryId));
    return entries.filter((e) => t.categoryIds!.includes(e.categoryId));
  };
  const match = (e: Entry) => !q || [e.title, e.description, e.contactName, e.address, e.tags.join(' '), ...e.customFields.map((f) => f.value)].join(' ').toLowerCase().includes(q.toLowerCase());

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...CITY_TABS.map((t) => ({ key: t.key, label: t.label, count: tabEntries(t.key).length })),
    { key: 'images', label: 'Images', count: images.length },
    { key: 'visits', label: 'Visit History', count: visits.length },
  ];

  async function remove() {
    setMenu(false);
    if (!(await confirm({ title: `Delete ${city!.name}?`, text: `This deletes the city and its ${entries.length} entries, ${visits.length} visits and ${images.length} images on all your devices.`, confirmLabel: 'Delete city', danger: true }))) return;
    await deleteCity(city!.id);
    toast(`${city!.name} deleted`);
    nav('/cities', { replace: true });
  }

  const addHref = (cat?: string) => `/entry/new?city=${city.id}${cat ? `&category=${cat}` : ''}`;
  const defaultCat = (key: string) => CITY_TABS.find((t) => t.key === key)?.categoryIds?.[0] ?? (key === 'contacts' ? 'contacts' : key === 'notes' ? 'notes' : undefined);

  return (
    <div className="animate-in">
      <Link to="/cities" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Cities</Link>

      <div className="card overflow-hidden">
        <div className="relative">
          <CoverImage image={images.find((i) => i.id === city.coverImageId)} className="h-44 sm:h-56" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5 flex flex-wrap items-end justify-between gap-3 text-white">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight drop-shadow sm:text-4xl">{city.name}</h1>
              <p className="text-sm text-white/85">{[city.state, city.country].filter(Boolean).join(', ')}</p>
              {access !== 'owner' && <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold backdrop-blur"><Users className="h-3 w-3" />Shared by {owner?.ownerName ?? 'a colleague'} · {access === 'editor' ? 'can edit' : 'view only'}</p>}
            </div>
            <div className="flex gap-2">
              {canEdit && <Button size="sm" variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => nav(addHref(defaultCat(tab)))}>Add entry</Button>}
              <div className="relative">
                <Button size="sm" variant="secondary" className="!bg-white/90 !text-slate-900" onClick={() => setMenu(!menu)} aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                    <div className="card absolute right-0 z-20 mt-2 w-52 overflow-hidden py-1 text-sm text-ink animate-in">
                      {canEdit && <MenuItem icon={Edit3} label="Edit city" onClick={() => { setMenu(false); setModal('edit'); }} />}
                      {canEdit && <MenuItem icon={CalendarPlus} label="Log a visit" onClick={() => { setMenu(false); setEditVisit(undefined); setModal('visit'); }} />}
                      {access === 'owner' && <MenuItem icon={Share2} label={`Share${sharedWith ? ` (${sharedWith})` : ''}`} onClick={() => { setMenu(false); setModal('share'); }} />}
                      <MenuItem icon={FileDown} label="Export PDF" onClick={() => nav(`/export?city=${city.id}`)} />
                      {access === 'owner' && <MenuItem icon={Trash2} label="Delete city" danger onClick={remove} />}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="scrollbar-none flex gap-1 overflow-x-auto border-t border-line px-3 py-2">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition', tab === t.key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-elevated hover:text-ink')}>
              {t.label}{'count' in t && t.count ? <span className={cn('ml-1.5 text-xs', tab === t.key ? 'text-white/75' : 'text-muted/70')}>{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {tab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <div className="card p-5">
                <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">About</h2><RecordSync status={city.syncStatus} /></div>
                {city.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{city.description}</p> : <p className="text-sm text-muted">No description yet.</p>}
                <h3 className="mb-2 mt-5 text-sm font-bold">Notes & observations</h3>
                {city.notes ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{city.notes}</p> : <p className="text-sm text-muted">Add tips you'd want to remember next time.</p>}
                {canEdit && <Button size="sm" variant="secondary" className="mt-4" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setModal('edit')}>Edit details</Button>}
              </div>
              <div className="card p-5">
                <h2 className="mb-3 font-bold">By category</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {categories.filter((c) => entries.some((e) => e.categoryId === c.id)).map((c) => (
                    <div key={c.id} className="flex items-center gap-2.5 rounded-xl bg-elevated/70 p-2.5">
                      <CategoryIcon category={c} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span><span className="text-sm font-bold">{entries.filter((e) => e.categoryId === c.id).length}</span>
                    </div>
                  ))}
                  {!entries.length && <p className="col-span-full text-sm text-muted">No entries yet.</p>}
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="card p-5">
                <h2 className="mb-3 font-bold">At a glance</h2>
                <dl className="space-y-2 text-sm">
                  {[['Entries', entries.length], ['Images', images.length], ['Visits', visits.length], ['Last visit', fmtDate(city.lastVisitedAt)], ['Updated', fmtDate(Math.max(city.updatedAt, ...entries.map((e) => e.updatedAt)))]].map(([k, v]) => (
                    <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
                  ))}
                </dl>
              </div>
              {images.length > 0 && <div className="card p-5"><h2 className="mb-3 font-bold">Recent photos</h2><Gallery images={images.slice(0, 6)} cols="grid-cols-3" /></div>}
            </div>
          </div>
        )}

        {CITY_TABS.some((t) => t.key === tab) && (() => {
          const list = tabEntries(tab).filter(match).sort((a, b) => b.updatedAt - a.updatedAt);
          return (
            <>
              <div className="mb-4 flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input className="input pl-10" placeholder="Search entries in this city…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => nav(addHref(defaultCat(tab)))}>Add</Button>}
              </div>
              {list.length ? <div className="grid gap-3 lg:grid-cols-2">{list.map((e) => <EntryCard key={e.id} entry={e} category={catOf(e.categoryId)} images={images} />)}</div>
                : <div className="card"><EmptyState icon={<Search className="h-7 w-7" />} title={q ? 'No matches' : 'Nothing here yet'} text={q ? 'Try another search term.' : 'Save your first one for this city.'} action={canEdit && !q ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => nav(addHref(defaultCat(tab)))}>Add entry</Button> : undefined} /></div>}
            </>
          );
        })()}

        {tab === 'images' && (images.length
          ? <div className="card p-4"><Gallery images={images} /></div>
          : <div className="card"><EmptyState icon={<Images className="h-7 w-7" />} title="No images yet" text="Photos attached to entries or the city cover appear here." /></div>)}

        {tab === 'visits' && (
          <div className="space-y-3">
            {canEdit && <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => { setEditVisit(undefined); setModal('visit'); }}>Log a visit</Button>}
            {visits.length ? (
              <ol className="relative ml-3 space-y-4 border-l-2 border-line pl-6">
                {visits.map((v) => (
                  <li key={v.id} className="relative">
                    <span className="absolute -left-[33px] top-4 grid h-4 w-4 place-items-center rounded-full border-2 border-surface bg-brand-500" />
                    <div className="card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-brand-500" />{fmtDate(v.startDate)}{v.endDate && v.endDate !== v.startDate && ` - ${fmtDate(v.endDate)}`}</div>
                          {v.purpose && <div className="mt-1 text-sm font-medium">{v.purpose}</div>}
                          {v.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{v.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <RecordSync status={v.syncStatus} />
                          {canEdit && <Button size="icon" variant="ghost" aria-label="Edit visit" onClick={() => { setEditVisit(v); setModal('visit'); }}><Pencil className="h-4 w-4" /></Button>}
                          {canEdit && <Button size="icon" variant="ghost" aria-label="Delete visit" onClick={async () => { if (await confirm({ title: 'Delete this visit?', confirmLabel: 'Delete', danger: true })) { await save('visits', { id: v.id, deletedAt: Date.now() }); toast('Visit deleted'); } }}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <div className="card"><EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No visits logged" text="Keep a history of each trip to this city." /></div>}
          </div>
        )}
      </div>

      {modal === 'edit' && <CityForm open city={city} onClose={() => setModal('')} />}
      {modal === 'share' && <ShareModal open city={city} onClose={() => setModal('')} />}
      {modal === 'visit' && <VisitForm open cityId={city.id} visit={editVisit} onClose={() => setModal('')} />}
    </div>
  );
}

function MenuItem({ icon: I, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn('flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-elevated', danger && 'text-red-600')}><I className="h-4 w-4" />{label}</button>;
}
