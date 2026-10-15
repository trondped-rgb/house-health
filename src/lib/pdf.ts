import type { House, Measure, Totals } from './physics';
import { co2Factor } from './physics';
import { fmt } from './store';
import { authorLine, type Author } from './author';
import { localDateStamp } from './share';

const FONT = 'DejaVu';
let fontCache: [string, string] | null = null;
const b64 = (buf: ArrayBuffer) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
/** Embed a ~55 kB DejaVu Sans subset (Latin-1, sub/superscripts, arrows, math) so ₂ ² → · æøå render. Fetched only when a PDF is made. */
async function embedFont(doc: import('jspdf').jsPDF) {
  if (!fontCache) { const base = import.meta.env.BASE_URL + 'fonts/'; const [r, b] = await Promise.all(['DejaVuSans-subset.ttf', 'DejaVuSans-Bold-subset.ttf'].map(async (f) => { const res = await fetch(base + f); if (!res.ok) throw new Error('font ' + f + ' ' + res.status); return b64(await res.arrayBuffer()); })); fontCache = [r, b]; }
  doc.addFileToVFS('DejaVuSans.ttf', fontCache[0]); doc.addFont('DejaVuSans.ttf', FONT, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fontCache[1]); doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');
}

export interface PdfPlan { chosen: Measure[]; b: Totals; a: Totals; sb: number; sa: number; inv: number; co2Year: number; co2Life: number }
export interface PdfScore { total: number; parts: { type: string; uAvg: number; score: number; share: number }[] }
/** Builds the report PDF (A4 landscape) with jsPDF + autotable, loaded lazily to keep the main bundle small. */
export async function buildReportPdf(house: House, pl: PdfPlan, sc: PdfScore, author?: Author): Promise<File> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const s = house.settings, f = co2Factor(s), cur = s.currency, dT = s.tIn - s.tOut, doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  await embedFont(doc);
  const T = (x: string) => x;
  doc.setFont(FONT, 'bold'); doc.setFontSize(18); doc.text('House Health report', 14, 16);
  doc.setFont(FONT, 'normal'); doc.setFontSize(9);
  doc.text(T(`${house.name} · ${s.location}, ${s.degreeDays} degree-days · indoor ${s.tIn} °C / outdoor ${s.tOut} °C · ${s.price} ${cur}/kWh · ${fmt(f * 1000, 1)} g CO₂e/kWh · ${new Date().toLocaleDateString()}`), 14, 22);
  const by = author ? `Utarbeidet av: ${authorLine(author)} · ${new Date().toLocaleDateString('nb-NO')}` : '';
  if (by) { doc.setFontSize(9); doc.text(T(by), 283, 16, { align: 'right' }); }
  doc.setFontSize(12); doc.setFont(FONT, 'bold');
  doc.text(T(`Score ${sc.total}/100   ·   ${fmt(pl.b.wpm2, 1)} W/m²   ·   ${fmt(pl.b.kwh)} kWh/yr   ·   ${fmt(pl.b.cost)} ${cur}/yr   ·   ${fmt(pl.b.kwh * f / 1000, 2)} t CO₂e/yr`), 14, 31);
  const opts = { styles: { font: FONT, fontSize: 8, cellPadding: 1.2 }, headStyles: { font: FONT, fontStyle: 'bold' as const, fillColor: [20, 32, 46] as [number, number, number] }, margin: { left: 14, right: 14 } };
  let y = 36;
  const sec = (title: string) => { doc.setFont(FONT, 'bold'); doc.setFontSize(11); doc.text(T(title), 14, y + 5); y += 7; };
  const next = () => { y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4; };
  sec('Score breakdown');
  autoTable(doc, { ...opts, startY: y, head: [['Category', 'Score', 'Avg U W/m²K', 'W/m²', 'Share of loss']], body: sc.parts.map((p) => [p.type, p.score, fmt(p.uAvg, 2), fmt(p.uAvg * dT, 1), fmt(p.share * 100) + '%']) }); next();
  sec('Selected retrofit: before / after');
  autoTable(doc, { ...opts, startY: y, head: [['', 'Score', 'W/m²', 'kW now', 'kWh/yr', `${cur}/yr`, 't CO₂e/yr']], body: [
    ['Before', pl.sb, fmt(pl.b.wpm2, 1), fmt(pl.b.watts / 1000, 2), fmt(pl.b.kwh), fmt(pl.b.cost), fmt(pl.b.kwh * f / 1000, 2)],
    ['After', pl.sa, fmt(pl.a.wpm2, 1), fmt(pl.a.watts / 1000, 2), fmt(pl.a.kwh), fmt(pl.a.cost), fmt(pl.a.kwh * f / 1000, 2)],
    ['Change', `+${pl.sa - pl.sb}`, T(`−${fmt(pl.b.wpm2 - pl.a.wpm2, 1)}`), T(`−${fmt((pl.b.watts - pl.a.watts) / 1000, 2)}`), T(`−${fmt(pl.b.kwh - pl.a.kwh)}`), T(`−${fmt(pl.b.cost - pl.a.cost)}`), T(`−${fmt(pl.co2Year, 2)}`)]] }); next();
  doc.setFont(FONT, 'normal'); doc.setFontSize(9);
  doc.text(T(`Investment ≈ ${fmt(pl.inv)} ${cur} · payback ${fmt(pl.inv / Math.max(pl.b.cost - pl.a.cost, 1e-6), 1)} yr · climate account: ${fmt(pl.co2Year, 2)} t CO₂e/yr, ${fmt(pl.co2Life, 1)} t over lifetimes, ${fmt(pl.inv ? pl.co2Life * 1e6 / pl.inv : 0, 1)} kg CO₂e per 1000 ${cur}`), 14, y + 2); y += 6;
  sec('Selected measures incl. climate account (klimaregnskap)');
  autoTable(doc, { ...opts, startY: y, head: [['#', 'Measure', 'Where', 'm²', "U → U'", 'kWh/yr saved', `${cur}/yr saved`, `Cost ${cur}`, 'Payback yr', 't CO₂e/yr', 'Life yr', 't CO₂e life', `kg/1000 ${cur}`]],
    body: pl.chosen.map((m, i) => [i + 1, m.label, m.room, fmt(m.area, 1), `${fmt(m.uBefore, 2)} → ${fmt(m.uAfter, 2)}`, fmt(m.kwhSaved), fmt(m.moneySaved), fmt(m.cost), fmt(m.payback, 1), fmt(m.co2Year, 3), m.life, fmt(m.co2Life, 2), fmt(m.cost ? m.co2Life * 1e6 / m.cost : 0, 1)]) }); next();
  if (by) { const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(80); doc.text(T(by + `   ·   side ${i}/${n}`), 14, 203); } doc.setPage(n); }
  doc.setFontSize(7.5); doc.setTextColor(100);
  doc.text(doc.splitTextToSize('Steady-state transmission model (ISO 6946 / degree-days). Ventilation, infiltration and solar/internal gains are excluded. Costs are rough estimates. CO₂ = kWh saved × emission factor, with assumed service lives (insulation 40 yr, windows/doors 30 yr), excluding embodied emissions. Font: DejaVu Sans. This is an engineering note, not an official energy certificate (energiattest). Generated by House Health, ' + location.origin + location.pathname, 268), 14, Math.min(y + 2, 195));
  return new File([doc.output('blob')], `house-health-report-${localDateStamp()}.pdf`, { type: 'application/pdf' });
}
