import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare, ChevronDown, Download, Eye, FileDown, FileText, Share2, Square } from 'lucide-react';
import { alive, useTable } from '../data/db';
import { useSession } from '../auth/session';
import { cityEntries, cityVisits } from '../data/repo';
import { CategoryIcon, useCategories } from '../components/common';
import { Button, EmptyState, useUi } from '../components/ui';
import { saveFile, shareFile, downloadBlob } from '../lib/share';
import { cn, errMsg, fmtBytes } from '../lib/util';

export default function ExportPage() {
  const [params] = useSearchParams();
  const { session, engine } = useSession();
  const { toast } = useUi();
  const cities = alive(useTable('cities')).sort((a, b) => a.name.localeCompare(b.name));
  const allEntries = useTable('entries');
  const allVisits = useTable('visits');
  const images = useTable('images');
  const categories = useCategories();
  const [cityId, setCityId] = useState(params.get('city') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [opts, setOpts] = useState({ images: true, overview: true });
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ blob: Blob; url: string; name: string } | null>(null);

  const city = cities.find((c) => c.id === cityId);
  const entries = useMemo(() => (city ? cityEntries(allEntries, city.id) : []), [city, allEntries]);
  const cats = categories.filter((c) => entries.some((e) => e.categoryId === c.id));

  // New city → select everything.
  useEffect(() => { setSelected(new Set(entries.map((e) => e.id))); setPdf(null); }, [cityId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const toggle = (ids: string[], on: boolean) => { const s = new Set(selected); ids.forEach((i) => (on ? s.add(i) : s.delete(i))); setSelected(s); setPdf(null); };
  const chosen = entries.filter((e) => selected.has(e.id));

  async function generate() {
    if (!city || !engine) return;
    setBusy(true);
    try {
      const { generateCityPdf } = await import('../lib/pdf'); // jsPDF loads only when needed
      const blob = await generateCityPdf({
        city, categories, entries: chosen, visits: cityVisits(allVisits, city.id), images: alive(images), includeImages: opts.images, includeOverview: opts.overview,
        author: session?.name ?? 'TripVault user', getImage: (m) => engine.getImageBlob(m),
      });
      const name = `TripVault-${city.name.replace(/[^\w-]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
      setPdf({ blob, url: URL.createObjectURL(blob), name });
      toast('PDF ready');
    } catch (e) { toast(`PDF generation failed: ${errMsg(e)}`, 'error'); }
    finally { setBusy(false); }
  }

  async function share() {
    if (!pdf) return;
    try {
      if (!(await shareFile(pdf.blob, pdf.name, `${city?.name} - TripVault`))) { downloadBlob(pdf.blob, pdf.name); toast('Sharing is not supported in this browser, so the PDF was downloaded instead.', 'info'); }
    } catch (e) { toast(`Could not share: ${errMsg(e)}`, 'error'); }
  }

  if (!cities.length) return <div className="card"><EmptyState icon={<FileDown className="h-7 w-7" />} title="Nothing to export yet" text="Add a city with some entries, then come back to create a PDF guide." /></div>;

  return (
    <div className="animate-in">
      <h1 className="text-2xl font-extrabold tracking-tight">Export & Share</h1>
      <p className="mb-5 text-sm text-muted">Create a professional PDF city guide. Works offline.</p>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <div className="card p-5">
            <Step n={1} title="Choose a city" />
            <select className="input" value={cityId} onChange={(e) => setCityId(e.target.value)}>
              <option value="">Select a city…</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? `, ${c.state}` : ''}</option>)}
            </select>
          </div>

          {city && (
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <Step n={2} title="Select content" />
                <button className="mb-3 text-sm font-semibold text-brand-600 dark:text-brand-200" onClick={() => toggle(entries.map((e) => e.id), chosen.length !== entries.length)}>{chosen.length === entries.length ? 'Clear all' : 'Select all'}</button>
              </div>
              {!entries.length && <p className="text-sm text-muted">This city has no entries. The PDF will contain the overview only.</p>}
              <ul className="space-y-1">
                {cats.map((c) => {
                  const ids = entries.filter((e) => e.categoryId === c.id).map((e) => e.id);
                  const n = ids.filter((i) => selected.has(i)).length;
                  const all = n === ids.length;
                  return (
                    <li key={c.id} className="rounded-xl border border-line">
                      <div className="flex items-center gap-2.5 p-2.5">
                        <button onClick={() => toggle(ids, !all)} aria-label={`Toggle ${c.name}`} className={n ? 'text-brand-600 dark:text-brand-200' : 'text-muted'}>{all ? <CheckSquare className="h-5 w-5" /> : <Square className={cn('h-5 w-5', n > 0 && 'fill-brand-500/20')} />}</button>
                        <CategoryIcon category={c} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                        <span className="text-xs text-muted">{n}/{ids.length}</span>
                        <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} aria-label="Choose entries" className="rounded-lg p-1 text-muted hover:bg-elevated"><ChevronDown className={cn('h-4 w-4 transition', expanded === c.id && 'rotate-180')} /></button>
                      </div>
                      {expanded === c.id && (
                        <ul className="border-t border-line px-2.5 py-1.5">
                          {entries.filter((e) => e.categoryId === c.id).map((e) => (
                            <li key={e.id}><label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm hover:bg-elevated">
                              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={selected.has(e.id)} onChange={(ev) => toggle([e.id], ev.target.checked)} />{e.title}
                            </label></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                {([['overview', 'Include city overview, visits & contacts'], ['images', 'Include photos']] as const).map(([k, l]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={opts[k]} onChange={(e) => { setOpts({ ...opts, [k]: e.target.checked }); setPdf(null); }} />{l}</label>
                ))}
              </div>
            </div>
          )}

          {city && (
            <div className="card p-5">
              <Step n={3} title="Generate" />
              <Button className="w-full" icon={<FileText className="h-4 w-4" />} loading={busy} onClick={generate}>{pdf ? 'Regenerate PDF' : `Generate PDF (${chosen.length} entries)`}</Button>
              {pdf && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={async () => toast(await saveFile(pdf.blob, pdf.name))}>Download</Button>
                  <Button variant="accent" icon={<Share2 className="h-4 w-4" />} onClick={share}>Share</Button>
                  <a href={pdf.url} target="_blank" rel="noreferrer" className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-brand-600 hover:bg-elevated lg:hidden dark:text-brand-200"><Eye className="h-4 w-4" />Open preview</a>
                  <p className="col-span-2 text-center text-xs text-muted">{pdf.name} · {fmtBytes(pdf.blob.size)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          <div className="card sticky top-6 hidden h-[78vh] overflow-hidden lg:block">
            {pdf ? <iframe title="PDF preview" src={pdf.url} className="h-full w-full" />
              : <EmptyState icon={<Eye className="h-7 w-7" />} title="Preview" text={city ? 'Generate the PDF to preview it here.' : 'Choose a city to begin.'} />}
          </div>
        </div>
      </div>
    </div>
  );
}

const Step = ({ n, title }: { n: number; title: string }) => (
  <h2 className="mb-3 flex items-center gap-2 font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-xs text-white">{n}</span>{title}</h2>
);
