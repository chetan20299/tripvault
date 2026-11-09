import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, ExternalLink, Flag, Globe, Mail, MapPin, Pencil, Phone, Trash2, User, X } from 'lucide-react';
import { useTable } from '../data/db';
import { deleteEntry } from '../data/repo';
import { CategoryIcon, RecordSync, useCategories } from '../components/common';
import { Gallery } from '../components/images';
import { Button, EmptyState, Stars, useUi } from '../components/ui';
import { fmtDate, hrefOf, timeAgo } from '../lib/util';
import { useAccess } from './CityDetail';

export default function EntryDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { toast, confirm } = useUi();
  const entry = useTable('entries').find((e) => e.id === id && !e.deletedAt);
  const city = useTable('cities').find((c) => c.id === entry?.cityId);
  const images = useTable('images').filter((i) => entry?.imageIds.includes(i.id) && !i.deletedAt);
  const category = useCategories().find((c) => c.id === entry?.categoryId);
  const access = useAccess(entry?.ownerId, entry?.cityId);

  if (!entry) return <div className="card"><EmptyState icon={<X className="h-7 w-7" />} title="Entry not found" text="It may have been deleted." action={<Button onClick={() => nav(-1)}>Go back</Button>} /></div>;

  async function remove() {
    if (!(await confirm({ title: 'Delete this entry?', text: `"${entry!.title}" and its photos will be deleted on all devices.`, confirmLabel: 'Delete', danger: true }))) return;
    await deleteEntry(entry!.id);
    toast('Entry deleted');
    nav(city ? `/cities/${city.id}` : '/', { replace: true });
  }

  const rows = [
    entry.contactName && { icon: User, label: 'Contact', value: entry.contactName },
    entry.phone && { icon: Phone, label: 'Phone', value: entry.phone, href: `tel:${entry.phone.replace(/[^\d+]/g, '')}` },
    entry.email && { icon: Mail, label: 'Email', value: entry.email, href: `mailto:${entry.email}` },
    entry.website && { icon: Globe, label: 'Website', value: entry.website, href: hrefOf(entry.website), external: true },
    entry.address && { icon: MapPin, label: 'Address', value: entry.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([entry.address, city?.name].filter(Boolean).join(', '))}`, external: true },
    entry.visitDate && { icon: Calendar, label: 'Visited', value: fmtDate(entry.visitDate) },
    entry.priority && { icon: Flag, label: 'Priority', value: entry.priority[0].toUpperCase() + entry.priority.slice(1) },
  ].filter(Boolean) as { icon: any; label: string; value: string; href?: string; external?: boolean }[];

  return (
    <div className="mx-auto max-w-3xl animate-in">
      <button onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back</button>
      <div className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <CategoryIcon category={category} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: category?.color }}>{category?.name ?? 'Other'}</div>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">{entry.title}</h1>
            {city && <Link to={`/cities/${city.id}`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-200"><MapPin className="h-3.5 w-3.5" />{city.name}{city.state && `, ${city.state}`}</Link>}
            {entry.rating > 0 && <div className="mt-2"><Stars value={entry.rating} /></div>}
          </div>
          {access !== 'viewer' && (
            <div className="flex gap-1">
              <Button size="icon" variant="secondary" onClick={() => nav(`/entry/${entry.id}/edit`)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="secondary" onClick={remove} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
          )}
        </div>

        {entry.description && <p className="mt-5 whitespace-pre-wrap leading-relaxed text-ink/85">{entry.description}</p>}

        {rows.length > 0 && (
          <dl className="mt-5 grid gap-2 sm:grid-cols-2">
            {rows.map(({ icon: I, label, value, href, external }) => (
              <div key={label} className="flex items-start gap-3 rounded-xl bg-elevated/70 p-3">
                <I className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
                  <dd className="break-words text-sm font-medium">{href ? <a href={href} target={external ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-200">{value}{external && <ExternalLink className="h-3 w-3" />}</a> : value}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}

        {entry.customFields.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-2 text-sm font-bold">Additional details</h2>
            <dl className="divide-y divide-line rounded-xl border border-line">
              {entry.customFields.map((c, i) => <div key={i} className="flex justify-between gap-4 px-3.5 py-2.5 text-sm"><dt className="text-muted">{c.label}</dt><dd className="text-right font-medium">{c.value}</dd></div>)}
            </dl>
          </div>
        )}

        {entry.tags.length > 0 && <div className="mt-5 flex flex-wrap gap-1.5">{entry.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</div>}
        {images.length > 0 && <div className="mt-6"><h2 className="mb-2 text-sm font-bold">Photos</h2><Gallery images={images} cols="grid-cols-3 sm:grid-cols-4" /></div>}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-muted">
          <span>Created {fmtDate(entry.createdAt)}</span><span>Updated {timeAgo(entry.updatedAt)}</span>
          {entry.syncStatus === 'synced' ? <span>Synced {timeAgo(entry.lastSyncedAt)}</span> : <RecordSync status={entry.syncStatus} />}
        </div>
      </div>
    </div>
  );
}
