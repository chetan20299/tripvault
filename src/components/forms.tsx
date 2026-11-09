import { useState } from 'react';
import { Trash2, UserPlus, Users } from 'lucide-react';
import type { City, Share, Visit } from '../types';
import { Button, Field, Modal, useUi } from './ui';
import { ImagePicker, type DraftImage } from './images';
import { addImage, removeImage, save, saveVisit } from '../data/repo';
import { getDB, alive, useTable } from '../data/db';
import { useSession } from '../auth/session';
import { errMsg } from '../lib/util';

// ---- City ----------------------------------------------------------------------------------
export function CityForm({ open, onClose, city, onSaved }: { open: boolean; onClose: () => void; city?: City; onSaved?: (c: City) => void }) {
  const { toast, confirm } = useUi();
  const [f, setF] = useState(() => ({ name: city?.name ?? '', state: city?.state ?? '', country: city?.country ?? '', description: city?.description ?? '', notes: city?.notes ?? '' }));
  const coverMeta = city?.coverImageId ? getDB().get('images', city.coverImageId) : undefined;
  const [cover, setCover] = useState<DraftImage[]>(coverMeta && !coverMeta.deletedAt ? [{ kind: 'existing', key: coverMeta.id, image: coverMeta }] : []);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = f.name.trim();
    if (!name) return setErr('City name is required');
    const norm = (s: string) => s.trim().toLowerCase();
    const dup = alive(getDB().all('cities')).find((c) => c.id !== city?.id && norm(c.name) === norm(name) && norm(c.state) === norm(f.state) && norm(c.country) === norm(f.country));
    if (dup && !(await confirm({ title: 'Duplicate city', text: `"${dup.name}" already exists in your vault. Create another one anyway?`, confirmLabel: 'Create anyway' }))) return;
    setBusy(true);
    try {
      const saved = await save('cities', { ...(city ? { id: city.id } : {}), ...f, name, state: f.state.trim(), country: f.country.trim() });
      // Cover image: remove replaced/removed one, add new.
      const keep = cover[0];
      if (coverMeta && (!keep || keep.kind === 'new')) await removeImage(coverMeta.id);
      if (keep?.kind === 'new') {
        const img = await addImage(keep.blob, { cityId: saved.id, parentId: saved.id, width: keep.width, height: keep.height });
        await save('cities', { id: saved.id, coverImageId: img.id });
      } else if (!keep && saved.coverImageId) await save('cities', { id: saved.id, coverImageId: null });
      toast(city ? 'City updated' : 'City added');
      onSaved?.(saved);
      onClose();
    } catch (e) { toast(`Could not save: ${errMsg(e)}`, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={city ? 'Edit city' : 'Add city'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="city-form" type="submit" loading={busy}>{city ? 'Save changes' : 'Add city'}</Button></>}>
      <form id="city-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="City name *" error={err} className="sm:col-span-3"><input className="input" value={f.name} onChange={(e) => { set('name')(e); setErr(''); }} placeholder="e.g. Mumbai" autoFocus /></Field>
        <Field label="State / Region"><input className="input" value={f.state} onChange={set('state')} placeholder="Maharashtra" /></Field>
        <Field label="Country" className="sm:col-span-2"><input className="input" value={f.country} onChange={set('country')} placeholder="India" list="countries" /></Field>
        <Field label="Description" className="sm:col-span-3"><textarea className="input min-h-[80px]" value={f.description} onChange={set('description')} placeholder="Why you visit, key business areas…" /></Field>
        <Field label="Personal notes & observations" className="sm:col-span-3"><textarea className="input min-h-[80px]" value={f.notes} onChange={set('notes')} placeholder="Traffic tips, culture, best areas to stay…" /></Field>
        <div className="sm:col-span-3"><span className="label">Cover photo</span><ImagePicker value={cover} onChange={(v) => setCover(v.slice(-1))} max={1} /></div>
      </form>
      <datalist id="countries">{[...new Set(alive(getDB().all('cities')).map((c) => c.country).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist>
    </Modal>
  );
}

// ---- Visit ---------------------------------------------------------------------------------
export function VisitForm({ open, onClose, cityId, visit }: { open: boolean; onClose: () => void; cityId: string; visit?: Visit }) {
  const { toast } = useUi();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ startDate: visit?.startDate ?? today, endDate: visit?.endDate ?? today, purpose: visit?.purpose ?? '', notes: visit?.notes ?? '' });
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.startDate) return setErr('Start date is required');
    if (f.endDate && f.endDate < f.startDate) return setErr('End date must be after the start date');
    await saveVisit({ ...(visit ? { id: visit.id } : {}), cityId, ...f, endDate: f.endDate || f.startDate });
    toast(visit ? 'Visit updated' : 'Visit logged');
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={visit ? 'Edit visit' : 'Log a visit'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="visit-form" type="submit">Save visit</Button></>}>
      <form id="visit-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label="From *" error={err}><input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="input" value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        <Field label="Purpose" className="col-span-2"><input className="input" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="Client meetings, conference…" /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input min-h-[80px]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

// ---- Share ---------------------------------------------------------------------------------
export function ShareModal({ open, onClose, city }: { open: boolean; onClose: () => void; city: City }) {
  const { engine, session } = useSession();
  const { toast, confirm } = useUi();
  const shares = useTable('shares').filter((s) => s.cityId === city.id && s.ownerId === session?.uid);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Share['role']>('viewer');
  const [busy, setBusy] = useState(false);
  const online = engine?.remote.isOnline();

  async function share(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast('Enter a valid email address', 'error');
    setBusy(true);
    try {
      // The city must exist on the server before someone else can read it.
      await engine!.syncNow();
      if (getDB().get('cities', city.id)?.syncStatus !== 'synced') throw new Error('This city has not synced yet. Try again once sync completes.');
      const s = await engine!.remote.shareCity(city, email, role, session!.name);
      await getDB().tx([{ table: 'shares', put: [s] }]);
      toast(`Shared with ${s.granteeEmail}`);
      setEmail('');
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setBusy(false); }
  }

  async function revoke(s: Share) {
    if (!(await confirm({ title: 'Remove access?', text: `${s.granteeEmail} will no longer see ${city.name}.`, confirmLabel: 'Remove', danger: true }))) return;
    try {
      await engine!.remote.revokeShare(s);
      await getDB().tx([{ table: 'shares', del: [s.id] }]);
      toast('Access removed');
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Share ${city.name}`}>
      <p className="text-sm text-muted">Give another TripVault user access to this city and all of its entries. Only this city is shared, nothing else in your vault.</p>
      {!online && <p className="mt-3 rounded-xl bg-accent-500/10 px-3 py-2 text-sm text-accent-600">Sharing needs an internet connection.</p>}
      <form onSubmit={share} className="mt-4 space-y-3">
        <Field label="Email of registered user" hint={session?.mode === 'demo' ? 'Demo: try priya@tripvault.app or rahul@tripvault.app' : undefined}>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" />
        </Field>
        <div className="flex gap-2">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Share['role'])}>
            <option value="viewer">Can view</option>
            <option value="editor">Can edit</option>
          </select>
          <Button type="submit" loading={busy} disabled={!online} icon={<UserPlus className="h-4 w-4" />}>Share</Button>
        </div>
      </form>
      <div className="mt-6">
        <div className="label flex items-center gap-1.5"><Users className="h-4 w-4" />People with access</div>
        {shares.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div><div className="font-medium">{s.granteeEmail}</div><div className="text-xs text-muted">{s.role === 'editor' ? 'Can edit' : 'Can view'}</div></div>
                <Button variant="ghost" size="icon" onClick={() => revoke(s)} disabled={!online} aria-label="Remove access"><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Not shared with anyone yet.</p>}
      </div>
    </Modal>
  );
}
