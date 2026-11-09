import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Plus, Trash2, X } from 'lucide-react';
import type { CustomField, Entry } from '../types';
import { alive, getDB, useTable } from '../data/db';
import { useSession } from '../auth/session';
import { ALL_FIELDS, primaryFields, type Field as FieldKey } from '../data/categories';
import { addImage, removeImage, save } from '../data/repo';
import { CategoryIcon, useCategories } from '../components/common';
import { ImagePicker, type DraftImage } from '../components/images';
import { CityForm } from '../components/forms';
import { Button, EmptyState, Field, Stars, useUi } from '../components/ui';
import { cn, errMsg, uid } from '../lib/util';

const LABELS: Record<FieldKey, string> = { address: 'Address / location', contactName: 'Contact person', phone: 'Phone number', email: 'Email address', website: 'Website', visitDate: 'Date of visit', rating: 'Rating', priority: 'Priority' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EntryForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast, confirm } = useUi();
  const { session } = useSession();
  const existing = id ? getDB().get('entries', id) : undefined;
  const categories = useCategories();
  const shares = useTable('shares');
  const cities = alive(useTable('cities'))
    .filter((c) => c.ownerId === session?.uid || shares.some((s) => s.cityId === c.id && s.granteeUid === session?.uid && s.role === 'editor'))
    .filter((c) => !existing || c.ownerId === existing.ownerId) // an entry can't move to another person's vault
    .sort((a, b) => a.name.localeCompare(b.name));

  const [f, setF] = useState<Omit<Entry, keyof import('../types').SyncMeta>>(() => existing ? structuredClone(existing) : {
    cityId: params.get('city') ?? '', categoryId: params.get('category') ?? 'leads', title: '', description: '', address: '', contactName: '', phone: '', email: '',
    website: '', visitDate: '', rating: 0, priority: '', tags: [], customFields: [], imageIds: [],
  });
  const [drafts, setDrafts] = useState<DraftImage[]>(() =>
    (existing?.imageIds ?? []).map((iid) => getDB().get('images', iid)).filter((m) => m && !m.deletedAt).map((m) => ({ kind: 'existing' as const, key: m!.id, image: m! })));
  const [tagInput, setTagInput] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cityModal, setCityModal] = useState(false);

  const primary = primaryFields(f.categoryId);
  const visible = useMemo(() => {
    const filled = ALL_FIELDS.filter((k) => (k === 'rating' ? f.rating > 0 : !!f[k]));
    return showAll ? ALL_FIELDS : ALL_FIELDS.filter((k) => primary.includes(k) || filled.includes(k));
  }, [showAll, primary, f]);

  if (id && !existing) return <div className="card"><EmptyState icon={<X className="h-7 w-7" />} title="Entry not found" action={<Button onClick={() => nav(-1)}>Go back</Button>} /></div>;
  if (existing && !cities.some((c) => c.id === existing.cityId)) return <div className="card"><EmptyState icon={<X className="h-7 w-7" />} title="View only" text="This entry belongs to a city shared with you as view-only." action={<Button onClick={() => nav(-1)}>Go back</Button>} /></div>;

  const upd = (patch: Partial<typeof f>) => { setF((p) => ({ ...p, ...patch })); setDirty(true); };
  const input = (k: 'title' | 'description' | FieldKey) => ({
    value: String(f[k] ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { upd({ [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: '' })); },
  });

  function addTag(raw: string) {
    const tags = raw.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
    if (tags.length) upd({ tags: [...new Set([...f.tags, ...tags])] });
    setTagInput('');
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = 'Title is required';
    if (!f.cityId) e.cityId = 'Choose a city';
    if (f.email && !EMAIL_RE.test(f.email.trim())) e.email = 'Invalid email address';
    if (f.phone && !/^[+\d\s().-]{5,}$/.test(f.phone.trim())) e.phone = 'Use digits, spaces, + ( ) -';
    if (f.website && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(f.website.trim())) e.website = 'Invalid website address';
    if (f.customFields.some((c) => c.value && !c.label.trim())) e.custom = 'Every custom field needs a label';
    setErrors(e);
    if (Object.keys(e).length) { toast('Please fix the highlighted fields', 'error'); setShowAll(true); }
    return !Object.keys(e).length;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const entryId = existing?.id ?? uid();
      // Images first (stored locally), then the entry that references them.
      const keptIds = new Set(drafts.filter((d) => d.kind === 'existing').map((d) => d.key));
      for (const iid of existing?.imageIds ?? []) if (!keptIds.has(iid)) await removeImage(iid);
      const imageIds: string[] = [];
      for (const d of drafts) {
        if (d.kind === 'existing') {
          imageIds.push(d.image.id);
          if (d.image.cityId !== f.cityId) await save('images', { id: d.image.id, cityId: f.cityId }); // entry moved city
        }
        else imageIds.push((await addImage(d.blob, { cityId: f.cityId, parentId: entryId, width: d.width, height: d.height })).id);
      }
      const clean = {
        ...f, id: entryId, title: f.title.trim(), email: f.email.trim(), phone: f.phone.trim(), website: f.website.trim(), imageIds,
        customFields: f.customFields.filter((c) => c.label.trim() || c.value.trim()).map((c) => ({ label: c.label.trim(), value: c.value.trim() })),
      };
      await save('entries', clean);
      toast(existing ? 'Entry updated' : 'Entry saved');
      nav(`/entry/${entryId}`, { replace: true });
    } catch (err) {
      toast(/quota/i.test(errMsg(err)) ? 'Device storage is full. Free up space or remove some images.' : `Could not save: ${errMsg(err)}`, 'error');
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (dirty && !(await confirm({ title: 'Discard changes?', text: 'Your unsaved changes will be lost.', confirmLabel: 'Discard', danger: true }))) return;
    nav(-1);
  }

  const setCustom = (i: number, patch: Partial<CustomField>) => upd({ customFields: f.customFields.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl animate-in" noValidate>
      <button type="button" onClick={cancel} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back</button>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">{existing ? 'Edit entry' : 'New entry'}</h1>

      <div className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City *" error={errors.cityId}>
            <div className="flex gap-2">
              <select className="input" value={f.cityId} onChange={(e) => { upd({ cityId: e.target.value }); setErrors((x) => ({ ...x, cityId: '' })); }}>
                <option value="">Select a city…</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? `, ${c.state}` : ''}</option>)}
              </select>
              {!existing && <Button type="button" variant="secondary" size="icon" className="shrink-0" onClick={() => setCityModal(true)} aria-label="Add new city"><Plus className="h-4 w-4" /></Button>}
            </div>
          </Field>
          <Field label="Category *">
            <div className="flex items-center gap-2">
              <CategoryIcon category={categories.find((c) => c.id === f.categoryId)} />
              <select className="input" value={f.categoryId} onChange={(e) => upd({ categoryId: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </Field>
        </div>

        <Field label="Title / name *" error={errors.title}><input className="input" {...input('title')} placeholder="e.g. Acme Corp, procurement head" autoFocus={!existing} /></Field>
        <Field label="Description & remarks"><textarea className="input min-h-[110px]" {...input('description')} placeholder="What matters, next steps, personal observations…" /></Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((k) => (
            <Field key={k} label={LABELS[k]} error={errors[k]} className={k === 'address' ? 'sm:col-span-2' : ''}>
              {k === 'rating' ? <div className="flex h-11 items-center"><Stars value={f.rating} onChange={(rating) => upd({ rating })} size="h-7 w-7" /></div>
                : k === 'priority' ? (
                  <div className="grid h-11 grid-cols-4 gap-1 rounded-xl bg-elevated p-1">
                    {(['', 'low', 'medium', 'high'] as const).map((p) => (
                      <button key={p} type="button" onClick={() => upd({ priority: p })} className={cn('rounded-lg text-xs font-semibold capitalize transition', f.priority === p ? 'bg-surface text-ink shadow-sm' : 'text-muted')}>{p || 'None'}</button>
                    ))}
                  </div>)
                : <input className="input" {...input(k)} type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : k === 'visitDate' ? 'date' : k === 'website' ? 'url' : 'text'} inputMode={k === 'phone' ? 'tel' : undefined} placeholder={k === 'website' ? 'example.com' : ''} />}
            </Field>
          ))}
        </div>
        {!showAll && visible.length < ALL_FIELDS.length && (
          <button type="button" onClick={() => setShowAll(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-200"><ChevronDown className="h-4 w-4" />More fields</button>
        )}

        <Field label="Tags" hint="Press Enter or comma to add">
          <div className="input flex flex-wrap items-center gap-1.5 !py-2">
            {f.tags.map((t) => <span key={t} className="chip !bg-brand-50 !text-brand-700 dark:!bg-brand-900/40 dark:!text-brand-100">#{t}<button type="button" onClick={() => upd({ tags: f.tags.filter((x) => x !== t) })} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button></span>)}
            <input className="min-w-[8rem] flex-1 bg-transparent outline-none" value={tagInput} onChange={(e) => e.target.value.endsWith(',') ? addTag(e.target.value) : setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } if (e.key === 'Backspace' && !tagInput && f.tags.length) upd({ tags: f.tags.slice(0, -1) }); }} onBlur={() => addTag(tagInput)} placeholder={f.tags.length ? '' : 'client, follow-up…'} />
          </div>
        </Field>

        <div>
          <span className="label">Custom fields</span>
          <div className="space-y-2">
            {f.customFields.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-2/5" placeholder="Label (e.g. Deal size)" value={c.label} onChange={(e) => setCustom(i, { label: e.target.value })} />
                <input className="input flex-1" placeholder="Value" value={c.value} onChange={(e) => setCustom(i, { value: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => upd({ customFields: f.customFields.filter((_, j) => j !== i) })} aria-label="Remove field"><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            ))}
            {errors.custom && <p className="text-xs font-medium text-red-600">{errors.custom}</p>}
            <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => upd({ customFields: [...f.customFields, { label: '', value: '' }] })}>Add field</Button>
          </div>
        </div>

        <div><span className="label">Photos</span><ImagePicker value={drafts} onChange={(v) => { setDrafts(v); setDirty(true); }} /></div>
      </div>

      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 mt-5 flex justify-end gap-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-xl lg:border-0 lg:bg-transparent lg:px-0">
        <Button type="button" variant="secondary" onClick={cancel}>Cancel</Button>
        <Button type="submit" loading={busy}>{existing ? 'Save changes' : 'Save entry'}</Button>
      </div>

      {cityModal && <CityForm open onClose={() => setCityModal(false)} onSaved={(c) => upd({ cityId: c.id })} />}
    </form>
  );
}
