import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getAllFundingRoundsDirect } from '@/lib/db';
import { standardizeCityName } from '@udyaibase/utils/src/cities';

/**
 * "AI Startups Funding Report", built on demand from the live funding tracker.
 * Amounts in USD: rounds stored only in INR are converted at INR_PER_USD (stated in the report).
 * Standard PDF fonts can't draw the rupee sign, so the report sticks to USD and ASCII.
 */

const INR_PER_USD = 84;
const TOKEN_DAYS = 7;

interface Round {
  roundType: string | null; amountUsd: number | null; amountInr: number | null; announcedAt: string | null;
  leadInvestors: string[] | null; allInvestors: string[] | null;
  startupName: string; headquartersCity: string | null; startupCategory: string | null;
}

const usd = (r: Round) => (r.amountUsd ? r.amountUsd / 100 : r.amountInr ? r.amountInr / 100 / INR_PER_USD : 0);
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : n > 0 ? `$${Math.round(n)}` : '-');
const label = (s: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'Undisclosed');
/** Keep text inside the WinAnsi set the standard fonts can encode. */
const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim();

function group(rounds: Round[], key: (r: Round) => string | null, top: number) {
  const m = new Map<string, { amount: number; count: number }>();
  for (const r of rounds) {
    const k = key(r);
    if (!k) continue;
    const g = m.get(k) ?? { amount: 0, count: 0 };
    g.amount += usd(r); g.count++;
    m.set(k, g);
  }
  return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, top);
}

export function summarise(rounds: Round[]) {
  const amounts = rounds.map(usd).filter((n) => n > 0).sort((a, b) => a - b);
  const total = amounts.reduce((s, n) => s + n, 0);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const investors = new Map<string, number>();
  for (const r of rounds) {
    for (const inv of new Set([...(r.leadInvestors ?? []), ...(r.allInvestors ?? [])].map((x) => x.trim()).filter(Boolean))) {
      investors.set(inv, (investors.get(inv) ?? 0) + 1);
    }
  }
  const quarters = new Map<string, number>();
  for (const r of rounds) {
    if (!r.announcedAt) continue;
    const d = new Date(r.announcedAt);
    if (Number.isNaN(d.getTime())) continue;
    const q = `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    quarters.set(q, (quarters.get(q) ?? 0) + usd(r));
  }
  return {
    total, median, rounds: rounds.length, startups: new Set(rounds.map((r) => r.startupName)).size,
    largest: [...rounds].sort((a, b) => usd(b) - usd(a)).slice(0, 15),
    byStage: group(rounds, (r) => label(r.roundType), 10),
    bySector: group(rounds, (r) => r.startupCategory, 10),
    byCity: group(rounds, (r) => (r.headquartersCity ? standardizeCityName(r.headquartersCity) : null), 10),
    investors: [...investors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    quarters: [...quarters.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8),
    convertedInr: rounds.some((r) => !r.amountUsd && r.amountInr),
  };
}

const BRAND = rgb(0.647, 0.059, 0.082);
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.88, 0.89, 0.91);

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private footer: string) { this.newPage(); }
  newPage() {
    this.page = this.doc.addPage([595, 842]);
    this.y = 790;
    this.page.drawText(ascii(this.footer), { x: 50, y: 30, size: 8, font: this.font, color: MUTED });
    this.page.drawText(`Page ${this.doc.getPageCount()}`, { x: 510, y: 30, size: 8, font: this.font, color: MUTED });
  }
  ensure(h: number) { if (this.y - h < 60) this.newPage(); }
  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    this.ensure(size + 6);
    this.page.drawText(ascii(s), { x: o.x ?? 50, y: this.y, size, font: o.bold ? this.bold : this.font, color: o.color ?? INK });
    this.y -= size + (o.gap ?? 6);
  }
  heading(s: string) { this.y -= 10; this.ensure(40); this.text(s, { size: 14, bold: true, color: BRAND, gap: 10 }); }
  table(cols: { title: string; x: number; right?: boolean }[], rows: string[][]) {
    this.ensure(30);
    for (const c of cols) this.page.drawText(c.title, { x: c.x, y: this.y, size: 8.5, font: this.bold, color: MUTED });
    this.y -= 6;
    this.page.drawLine({ start: { x: 50, y: this.y }, end: { x: 545, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 13;
    for (const row of rows) {
      this.ensure(16);
      row.forEach((cell, i) => {
        const t = ascii(cell).slice(0, i === 0 ? 48 : 30);
        const w = this.font.widthOfTextAtSize(t, 9.5);
        this.page.drawText(t, { x: cols[i].right ? cols[i].x - w : cols[i].x, y: this.y, size: 9.5, font: this.font, color: INK });
      });
      this.y -= 15;
    }
  }
  bars(items: { key: string; amount: number }[]) {
    const max = Math.max(1, ...items.map((i) => i.amount));
    for (const it of items) {
      this.ensure(18);
      this.page.drawText(ascii(it.key), { x: 50, y: this.y, size: 9.5, font: this.font, color: INK });
      const w = Math.max(2, (it.amount / max) * 300);
      this.page.drawRectangle({ x: 140, y: this.y - 2, width: w, height: 10, color: BRAND });
      this.page.drawText(money(it.amount), { x: 140 + w + 6, y: this.y, size: 9, font: this.font, color: MUTED });
      this.y -= 18;
    }
  }
}

export async function buildFundingReportPdf(): Promise<Uint8Array> {
  const rounds = (await getAllFundingRoundsDirect()) as unknown as Round[];
  const s = summarise(rounds);
  const doc = await PDFDocument.create();
  doc.setTitle('AI Startups Funding Report - Udyaibase');
  doc.setAuthor('Udyaibase');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const w = new Writer(doc, font, bold, `Udyaibase AI Startups Funding Report - generated ${date} - udyaibase.com/funding`);

  w.text('UDYAIBASE', { size: 10, bold: true, color: BRAND, gap: 14 });
  w.text('AI Startups Funding Report', { size: 26, bold: true, gap: 10 });
  w.text(`AI startup funding tracked by Udyaibase, with a focus on India. Generated ${date}.`, { size: 11, color: MUTED, gap: 24 });

  const kpis: [string, string][] = [
    ['Total raised', money(s.total)], ['Funding rounds', String(s.rounds)], ['Startups funded', String(s.startups)],
    ['Median round', money(s.median)], ['Largest round', s.largest[0] ? `${money(usd(s.largest[0]))} (${s.largest[0].startupName})` : '-'],
  ];
  for (const [k, v] of kpis) {
    w.ensure(22);
    w.page.drawText(k, { x: 50, y: w.y, size: 10, font, color: MUTED });
    w.page.drawText(ascii(v), { x: 200, y: w.y, size: 12, font: bold, color: INK });
    w.y -= 22;
  }

  if (s.quarters.length) { w.heading('Funding by quarter'); w.bars(s.quarters.map(([key, amount]) => ({ key, amount }))); }
  w.heading('By stage');
  w.table([{ title: 'STAGE', x: 50 }, { title: 'ROUNDS', x: 380, right: true }, { title: 'AMOUNT', x: 545, right: true }], s.byStage.map((g) => [g.key, String(g.count), money(g.amount)]));
  if (s.bySector.length) {
    w.heading('Top sectors');
    w.table([{ title: 'SECTOR', x: 50 }, { title: 'ROUNDS', x: 380, right: true }, { title: 'AMOUNT', x: 545, right: true }], s.bySector.map((g) => [g.key, String(g.count), money(g.amount)]));
  }
  if (s.byCity.length) {
    w.heading('Top cities');
    w.table([{ title: 'CITY', x: 50 }, { title: 'ROUNDS', x: 380, right: true }, { title: 'AMOUNT', x: 545, right: true }], s.byCity.map((g) => [g.key, String(g.count), money(g.amount)]));
  }
  w.heading('Largest rounds');
  w.table(
    [{ title: 'STARTUP', x: 50 }, { title: 'STAGE', x: 250 }, { title: 'DATE', x: 360 }, { title: 'AMOUNT', x: 545, right: true }],
    s.largest.map((r) => {
      const d = r.announcedAt ? new Date(r.announcedAt) : null;
      return [r.startupName, label(r.roundType), d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-', money(usd(r))];
    }),
  );
  if (s.investors.length) {
    w.heading('Most active investors');
    w.table([{ title: 'INVESTOR', x: 50 }, { title: 'DEALS', x: 545, right: true }], s.investors.map(([name, n]) => [name, String(n)]));
  }
  w.heading('About this data');
  w.text('Rounds are collected from public announcements and founder submissions on Udyaibase.', { size: 9.5, color: MUTED });
  if (s.convertedInr) w.text(`Rounds reported only in INR are converted at Rs ${INR_PER_USD} per USD.`, { size: 9.5, color: MUTED });
  w.text('Explore and filter the live data at udyaibase.com/funding.', { size: 9.5, color: MUTED });
  return doc.save();
}

/** Signed download link for the email-gated report (no account needed). */
function secret() {
  const s = process.env.APPLY_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('No signing secret configured');
  return `${s}:funding-report`;
}

export function reportToken(email: string): string {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase(), x: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyReportToken(token: string): boolean {
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).x > Date.now(); } catch { return false; }
}
