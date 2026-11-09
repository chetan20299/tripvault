import { Link } from 'react-router-dom';
import { MapPin, Phone, Mail, Flag } from 'lucide-react';
import type { Category, Entry, ImageMeta } from '../types';
import { CategoryIcon, RecordSync } from './common';
import { ImageThumb } from './images';
import { Stars } from './ui';
import { cn } from '../lib/util';

const PRIORITY = { high: 'text-red-600 bg-red-500/10', medium: 'text-accent-600 bg-accent-500/10', low: 'text-slate-500 bg-slate-500/10' };

export function EntryCard({ entry, category, images }: { entry: Entry; category?: Category; images: ImageMeta[] }) {
  const thumb = images.find((i) => i.id === entry.imageIds[0] && !i.deletedAt);
  return (
    <Link to={`/entry/${entry.id}`} className="card flex gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <CategoryIcon category={category} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold leading-snug">{entry.title}</h3>
          {entry.priority && <span className={cn('chip shrink-0 !py-0.5 capitalize', PRIORITY[entry.priority])}><Flag className="h-3 w-3" />{entry.priority}</span>}
        </div>
        {entry.contactName && <div className="text-sm text-muted">{entry.contactName}</div>}
        {entry.description && <p className="mt-1 line-clamp-2 text-sm text-ink/75">{entry.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {entry.rating > 0 && <Stars value={entry.rating} size="h-3.5 w-3.5" />}
          {entry.address && <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate max-w-[14rem]">{entry.address}</span></span>}
          {entry.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{entry.phone}</span>}
          {entry.email && <span className="hidden items-center gap-1 sm:flex"><Mail className="h-3.5 w-3.5" />{entry.email}</span>}
          <RecordSync status={entry.syncStatus} />
        </div>
        {entry.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{entry.tags.map((t) => <span key={t} className="chip !py-0.5">#{t}</span>)}</div>}
      </div>
      {thumb && <ImageThumb image={thumb} className="pointer-events-none hidden h-20 w-20 shrink-0 rounded-xl sm:block" />}
    </Link>
  );
}
