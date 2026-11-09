import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CloudOff, ImagePlus, Loader2, UploadCloud, X } from 'lucide-react';
import type { ImageMeta } from '../types';
import { useSession } from '../auth/session';
import { cn, uid } from '../lib/util';
import { compressImage } from '../lib/image';
import { useUi } from './ui';

/** Object URL for an image: local blob, or downloaded + cached for offline. */
export function useImageUrl(image: ImageMeta | undefined) {
  const { engine } = useSession();
  const [state, setState] = useState<{ url: string | null; status: 'loading' | 'ready' | 'unavailable' }>({ url: null, status: 'loading' });
  useEffect(() => {
    if (!image || !engine) return;
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, status: 'loading' });
    engine.getImageBlob(image)
      .then((b) => { if (cancelled) return; if (b) { url = URL.createObjectURL(b); setState({ url, status: 'ready' }); } else setState({ url: null, status: 'unavailable' }); })
      .catch(() => !cancelled && setState({ url: null, status: 'unavailable' }));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [image?.id, image?.remoteRef, engine]);
  return state;
}

export function ImageThumb({ image, className, onClick }: { image: ImageMeta; className?: string; onClick?: () => void }) {
  const { url, status } = useImageUrl(image);
  return (
    <button type="button" onClick={onClick} className={cn('relative overflow-hidden bg-elevated', className)} aria-label="Open image">
      {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
      {status === 'loading' && <div className="skeleton absolute inset-0 rounded-none" />}
      {status === 'unavailable' && <div className="absolute inset-0 grid place-items-center text-muted"><CloudOff className="h-5 w-5" /></div>}
      {!image.remoteRef && <span title="Waiting to upload" className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white"><UploadCloud className="h-3 w-3" /></span>}
    </button>
  );
}

export function CoverImage({ image, className }: { image?: ImageMeta; className?: string }) {
  const { url } = useImageUrl(image);
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-900', className)}>
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

export function Gallery({ images, cols = 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5' }: { images: ImageMeta[]; cols?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={cn('grid gap-2', cols)}>
        {images.map((img, i) => <ImageThumb key={img.id} image={img} onClick={() => setOpen(i)} className="aspect-square rounded-xl" />)}
      </div>
      {open !== null && images[open] && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ images, index, onIndex, onClose }: { images: ImageMeta[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { url, status } = useImageUrl(images[index]);
  const go = (d: number) => onIndex((index + d + images.length) % images.length);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-in" onClick={onClose}>
      <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white safe-top" onClick={onClose} aria-label="Close"><X /></button>
      {images.length > 1 && <>
        <button className="absolute left-3 rounded-full bg-white/10 p-2 text-white" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous"><ChevronLeft /></button>
        <button className="absolute right-3 rounded-full bg-white/10 p-2 text-white" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next"><ChevronRight /></button>
      </>}
      {url ? <img src={url} alt="" className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        : status === 'loading' ? <Loader2 className="h-8 w-8 animate-spin text-white" /> : <p className="text-white/70">Image not available offline</p>}
      <div className="absolute bottom-5 text-sm text-white/70 safe-bottom">{index + 1} / {images.length}</div>
    </div>
  );
}

// ---- Picker used in forms ------------------------------------------------------------------
export type DraftImage =
  | { kind: 'existing'; key: string; image: ImageMeta }
  | { kind: 'new'; key: string; blob: Blob; width: number; height: number; url: string };

export function ImagePicker({ value, onChange, max = 12 }: { value: DraftImage[]; onChange: (v: DraftImage[]) => void; max?: number }) {
  const { toast } = useUi();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(value);
  latest.current = value;

  // Revoke preview URLs on unmount.
  useEffect(() => () => latest.current.forEach((d) => d.kind === 'new' && URL.revokeObjectURL(d.url)), []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const room = max - value.length;
    if (room <= 0) return toast(`Up to ${max} images per entry`, 'warning');
    setBusy(true);
    const added: DraftImage[] = [];
    for (const f of [...files].slice(0, room)) {
      try {
        const c = await compressImage(f);
        added.push({ kind: 'new', key: uid(), ...c, url: URL.createObjectURL(c.blob) });
      } catch (e: any) { toast(`${f.name}: ${e.message}`, 'error'); }
    }
    if (files.length > room) toast(`Only ${room} more image(s) allowed`, 'warning');
    onChange([...latest.current, ...added]);
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  const remove = (key: string) => {
    const d = value.find((x) => x.key === key);
    if (d?.kind === 'new') URL.revokeObjectURL(d.url);
    onChange(value.filter((x) => x.key !== key));
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {value.map((d) => (
          <div key={d.key} className="group relative aspect-square">
            {d.kind === 'new'
              ? <img src={d.url} alt="" className="h-full w-full rounded-xl object-cover" />
              : <ImageThumb image={d.image} className="h-full w-full rounded-xl" />}
            {d.kind === 'new' && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">New</span>}
            <button type="button" onClick={() => remove(d.key)} aria-label="Remove image"
              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white shadow-md transition hover:scale-110"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line text-muted transition hover:border-brand-400 hover:text-brand-500">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="flex flex-col items-center gap-1 text-xs font-medium"><ImagePlus className="h-6 w-6" />Add photos</div>}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      <p className="mt-2 text-xs text-muted">Images are compressed on your device and saved offline. They upload automatically when you're online.</p>
    </div>
  );
}
