import { useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Category } from '../types';
import { alive, useTable } from '../data/db';
import { deleteCategory, save } from '../data/repo';
import { CategoryIcon, COLORS, ICONS, RecordSync, useCategories } from '../components/common';
import { Button, Field, Modal, useUi } from '../components/ui';
import { FALLBACK_CATEGORY } from '../data/categories';
import { cn } from '../lib/util';

export default function Categories() {
  const categories = useCategories();
  const entries = alive(useTable('entries'));
  const { toast, confirm } = useUi();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  async function remove(c: Category) {
    const n = entries.filter((e) => e.categoryId === c.id).length;
    const target = categories.find((x) => x.id === FALLBACK_CATEGORY && x.id !== c.id) ?? categories.find((x) => x.id !== c.id);
    if (!target) return;
    const ok = await confirm({ title: `Delete "${c.name}"?`, text: n ? `${n} entr${n === 1 ? 'y' : 'ies'} will move to "${target.name}". No entries are deleted.` : 'This category has no entries.', confirmLabel: 'Delete category', danger: true });
    if (!ok) return;
    await deleteCategory(c.id, target.id);
    toast('Category deleted');
  }

  return (
    <div className="animate-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold tracking-tight">Categories</h1><p className="text-sm text-muted">Organise what you save. Create your own with a custom icon and color.</p></div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New category</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const n = entries.filter((e) => e.categoryId === c.id).length;
          return (
            <div key={c.id} className="card flex items-center gap-3 p-4">
              <CategoryIcon category={c} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{c.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted">{n} entr{n === 1 ? 'y' : 'ies'}{c.isDefault && <span className="inline-flex items-center gap-0.5"><Lock className="h-3 w-3" />Default</span>}<RecordSync status={c.syncStatus} /></div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></Button>
              {!c.isDefault && <Button size="icon" variant="ghost" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
            </div>
          );
        })}
      </div>
      {editing && <CategoryModal category={editing === 'new' ? undefined : editing} existing={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryModal({ category, existing, onClose }: { category?: Category; existing: Category[]; onClose: () => void }) {
  const { toast } = useUi();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'star');
  const [color, setColor] = useState(category?.color ?? COLORS[1]);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setErr('Name is required');
    if (existing.some((c) => c.id !== category?.id && c.name.toLowerCase() === n.toLowerCase())) return setErr('A category with this name already exists');
    await save('categories', { ...(category ? { id: category.id } : { sortOrder: 100 + existing.length }), name: n, icon, color });
    toast(category ? 'Category updated' : 'Category created');
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={category ? 'Edit category' : 'New category'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="cat-form" type="submit">Save</Button></>}>
      <form id="cat-form" onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl bg-elevated/70 p-3"><CategoryIcon category={{ icon, color }} size="lg" /><span className="font-bold">{name || 'Category name'}</span></div>
        <Field label="Name *" error={err}><input className="input" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="e.g. Coworking Spaces" autoFocus /></Field>
        <div>
          <span className="label">Icon</span>
          <div className="grid grid-cols-7 gap-1.5">
            {Object.entries(ICONS).map(([k, I]) => (
              <button key={k} type="button" onClick={() => setIcon(k)} aria-label={k} className={cn('grid aspect-square place-items-center rounded-xl border transition', icon === k ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-900/40' : 'border-line text-muted hover:bg-elevated')}><I className="h-[18px] w-[18px]" /></button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-surface transition', color === c && 'ring-2 ring-brand-500')} style={{ backgroundColor: c }} />)}
          </div>
        </div>
      </form>
    </Modal>
  );
}
