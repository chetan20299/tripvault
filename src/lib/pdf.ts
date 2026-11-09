import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Category, City, Entry, ImageMeta, Visit } from '../types';
import { logoPng } from './logo';
import { blobToDataUrl, fmtDate } from './util';

export interface PdfInput {
  city: City;
  categories: Category[]; // in display order; only those with selected entries are rendered
  entries: Entry[];
  visits: Visit[];
  images: ImageMeta[];
  includeImages: boolean;
  includeOverview: boolean;
  author: string;
  getImage: (m: ImageMeta) => Promise<Blob | undefined>;
}

const BRAND: [number, number, number] = [11, 79, 108];
const DARK: [number, number, number] = [6, 41, 58];
const ACCENT: [number, number, number] = [245, 158, 11];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const M = 16; // margin mm

/**
 * Built-in PDF fonts cover Latin-1 only.
 * ponytail: non-Latin scripts (Hindi, Arabic…) become "?"; embed a Unicode TTF via doc.addFont if needed.
 */
const t = (s: string | undefined | null) =>
  (s ?? '').replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/↔/g, '<->').replace(/…/g, '...').replace(/★/g, '*')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export async function generateCityPdf(input: PdfInput): Promise<Blob> {
  const { city, entries, visits, images, includeImages, author } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const logo = await logoPng(256).catch(() => null);
  const imgData = async (id: string | null) => {
    const m = id && images.find((i) => i.id === id && !i.deletedAt);
    if (!m) return null;
    const b = await input.getImage(m).catch(() => undefined);
    return b ? { url: await blobToDataUrl(b), w: m.width || 4, h: m.height || 3 } : null;
  };

  // ---- cover -----------------------------------------------------------------------------
  doc.setFillColor(...DARK); doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(...BRAND); doc.rect(0, 0, W, H * 0.62, 'F');
  const cover = includeImages ? await imgData(city.coverImageId) : null;
  if (cover) {
    const h = H * 0.42;
    doc.addImage(cover.url, 'JPEG', 0, 0, W, h, undefined, 'FAST');
    doc.setFillColor(...BRAND); doc.rect(0, h, W, H * 0.62 - h, 'F');
  }
  if (logo) doc.addImage(logo, 'PNG', M, M, 14, 14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('TripVault', M + 18, M + 6.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('Your Business Travel Knowledge', M + 18, M + 11.5);

  let y = H * 0.62 - 34;
  doc.setFillColor(...ACCENT); doc.rect(M, y - 10, 18, 1.6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(34); doc.text(t(city.name), M, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.text(t([city.state, city.country].filter(Boolean).join(', ')), M, y + 13);

  const cats = input.categories.filter((c) => entries.some((e) => e.categoryId === c.id));
  const stats = [[String(entries.length), 'Entries'], [String(cats.length), 'Categories'], [String(visits.length), 'Visits']];
  y = H * 0.62 + 22;
  stats.forEach(([n, l], i) => {
    const x = M + i * 50;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(...ACCENT); doc.text(n, x, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(200, 215, 225); doc.text(l.toUpperCase(), x, y + 6);
  });
  doc.setFontSize(9); doc.setTextColor(170, 190, 200);
  doc.text(t(`Prepared by ${author}`), M, H - M - 6);
  doc.text(`Generated ${fmtDate(Date.now())} - Last updated ${fmtDate(Math.max(city.updatedAt, ...entries.map((e) => e.updatedAt)))}`, M, H - M);

  // ---- body helpers ----------------------------------------------------------------------
  const top = M + 10;
  const bottom = H - M - 8;
  doc.addPage(); y = top;
  const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = top; } };
  const heading = (text: string, color: [number, number, number] = BRAND) => {
    ensure(18);
    doc.setFillColor(...color); doc.roundedRect(M, y, 3, 9, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK); doc.text(t(text), M + 6, y + 7);
    y += 15;
  };
  const para = (text: string, size = 10, color = INK) => {
    if (!text.trim()) return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(t(text), W - 2 * M)) { ensure(5); doc.text(line, M, y + 4); y += size * 0.45; }
    y += 3;
  };
  const table = (head: string[] | null, body: string[][], opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top, bottom: H - bottom }, head: head ? [head.map(t)] : undefined, body: body.map((r) => r.map(t)),
      theme: head ? 'striped' : 'plain', styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: 1.8, overflow: 'linebreak' },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 247, 250] }, ...opts,
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  };

  // ---- overview --------------------------------------------------------------------------
  if (input.includeOverview) {
    heading('City Overview');
    para(city.description, 11);
    if (city.notes) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...MUTED); ensure(8); doc.text('NOTES & OBSERVATIONS', M, y + 4); y += 7; para(city.notes); }
    if (visits.length) {
      ensure(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...MUTED); doc.text('VISIT HISTORY', M, y + 4); y += 7;
      table(['From', 'To', 'Purpose', 'Notes'], visits.map((v) => [fmtDate(v.startDate), fmtDate(v.endDate), v.purpose, v.notes]), { columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 26 } } });
    }
    const contacts = entries.filter((e) => e.phone || e.email);
    if (contacts.length) {
      ensure(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...MUTED); doc.text('KEY CONTACTS', M, y + 4); y += 7;
      table(['Name', 'Contact person', 'Phone', 'Email'], contacts.map((e) => [e.title, e.contactName, e.phone, e.email]));
    }
  }

  // ---- category sections -----------------------------------------------------------------
  for (const cat of cats) {
    if (y > top) { doc.addPage(); y = top; }
    heading(cat.name, hexRgb(cat.color));
    for (const e of entries.filter((x) => x.categoryId === cat.id)) {
      ensure(24);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...INK); doc.text(t(e.title), M, y + 4);
      const badges = [e.rating ? `${e.rating}/5 rating` : '', e.priority ? `${e.priority} priority` : ''].filter(Boolean).join('  -  ');
      if (badges) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ACCENT); doc.text(t(badges), W - M, y + 4, { align: 'right' }); }
      y += 8;
      const rows: string[][] = ([
        ['Address', e.address], ['Contact', e.contactName], ['Phone', e.phone], ['Email', e.email], ['Website', e.website],
        ['Visited', e.visitDate ? fmtDate(e.visitDate) : ''], ['Tags', e.tags.join(', ')], ...e.customFields.map((f) => [f.label, f.value]),
      ] as string[][]).filter(([, v]) => v);
      if (rows.length) table(null, rows, { columnStyles: { 0: { cellWidth: 28, textColor: MUTED, fontStyle: 'bold' } } });
      para(e.description);

      if (includeImages && e.imageIds.length) {
        const pics = (await Promise.all(e.imageIds.slice(0, 4).map(imgData))).filter(Boolean) as { url: string; w: number; h: number }[];
        const colW = (W - 2 * M - 6) / 2;
        for (let i = 0; i < pics.length; i += 2) {
          const row = pics.slice(i, i + 2);
          const rowH = Math.min(60, Math.max(...row.map((p) => (colW * p.h) / p.w)));
          ensure(rowH + 4);
          row.forEach((p, j) => {
            const h = Math.min(rowH, (colW * p.h) / p.w);
            const w = (h * p.w) / p.h;
            doc.addImage(p.url, 'JPEG', M + j * (colW + 6), y, w, h, undefined, 'FAST');
          });
          y += rowH + 4;
        }
      }
      doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 6;
    }
  }

  // ---- header/footer with page numbers (skip cover) ---------------------------------------
  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    if (logo) doc.addImage(logo, 'PNG', M, 8, 5, 5);
    doc.text('TripVault', M + 7, 11.8);
    doc.text(t(city.name), W - M, 11.8, { align: 'right' });
    doc.setDrawColor(226, 232, 240); doc.line(M, 15, W - M, 15);
    doc.line(M, H - 12, W - M, H - 12);
    doc.text('Confidential - for personal and team use', M, H - 7);
    doc.text(`Page ${p - 1} of ${pages - 1}`, W - M, H - 7, { align: 'right' });
  }
  return doc.output('blob');
}
