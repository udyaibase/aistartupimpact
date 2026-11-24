import { unzipSync, strFromU8 } from 'fflate';
import { getDocumentProxy } from 'unpdf';
import type { ResumeKind } from '@/lib/jobs/resume-text';

/**
 * Complete, ordered text of a resume as numbered lines: step 1 of the resume engine.
 *
 * - PDF: every page (up to MAX_PAGES), rebuilt from text positions, so two-column layouts read column by column
 *   instead of interleaving, and repeated page headers/footers and page numbers are dropped.
 * - DOCX: the body plus headers, tables and text boxes (each text box once; Word stores a fallback copy too), without
 *   tracked deletions.
 * - Contact details (emails, phones, links) are pulled out here by code, so later steps can remove them before any
 *   text reaches an AI model.
 * - Pages with almost no text are reported (`lowTextPages`): they're usually scans, which need OCR.
 *
 * No AI here. Pure functions are exported for tests.
 */

export const EXTRACT_VERSION = 'extract-v1';
export const MAX_PAGES = 10;
/** Hard cap on lines kept (a 10-page resume is ~600 lines). */
const MAX_LINES = 1200;
const MAX_LINE_CHARS = 400;
/** A page with fewer characters than this is treated as having no usable text (probably a scan). */
export const LOW_TEXT_CHARS = 40;
const MAX_UNZIPPED = 8 * 1024 * 1024;

export interface ExtractedResume {
  version: string;
  format: 'pdf' | 'docx';
  /** Lines in reading order. Line N in prompts is `lines[N - 1]`. */
  lines: string[];
  pageCount: number;
  pagesRead: number;
  /** 1-based page numbers with almost no text (likely scanned images). */
  lowTextPages: number[];
  /** 1-based page numbers laid out in two columns. */
  twoColumnPages: number[];
  chars: number;
  contacts: { emails: string[]; phones: string[]; links: string[] };
}

/* ------------------------------------------------------------------ PDF layout */

/** One positioned piece of text from a PDF page (PDF coordinates: y grows upwards). */
export interface TextPiece { str: string; x: number; y: number; w: number; h: number }

/**
 * Rebuild reading-order lines from positioned text. Finds a vertical gutter (a two-column layout) and, between
 * full-width rows such as the name banner or a full-width section, reads the left column then the right one.
 */
export function layoutLines(pieces: TextPiece[], pageWidth: number): string[] {
  const items = pieces.filter((p) => p.str.trim() !== '' && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!items.length) return [];
  const gutter = findGutter(items, pageWidth);
  if (gutter == null) return toLines(items);

  // Rows that cross the gutter are full-width; everything between two of them is split into left and right columns.
  const crosses = (p: TextPiece) => p.x < gutter && p.x + p.w > gutter;
  const rows = groupRows(items);
  const out: string[] = [];
  let left: TextPiece[] = [];
  let right: TextPiece[] = [];
  const flush = () => { out.push(...toLines(left), ...toLines(right)); left = []; right = []; };
  for (const row of rows) {
    if (row.some(crosses)) { flush(); out.push(...toLines(row)); continue; }
    for (const p of row) (p.x + p.w / 2 < gutter ? left : right).push(p);
  }
  flush();
  return out;
}

/** x position of an empty vertical band between two filled columns, or null for a single-column page. */
export function findGutter(items: TextPiece[], pageWidth: number): number | null {
  if (items.length < 12 || pageWidth <= 0) return null;
  const from = Math.floor(pageWidth * 0.2);
  const to = Math.ceil(pageWidth * 0.8);
  const step = 2;
  const covered = new Array<number>(Math.ceil(pageWidth / step) + 1).fill(0);
  for (const p of items) {
    for (let x = Math.max(0, Math.floor(p.x / step)); x <= Math.min(covered.length - 1, Math.ceil((p.x + p.w) / step)); x++) covered[x]++;
  }
  // Allow a few crossing pieces (a full-width heading or the name banner).
  const allowed = Math.max(2, Math.round(items.length * 0.06));
  let best: { start: number; len: number } | null = null;
  let start = -1;
  for (let i = Math.floor(from / step); i <= Math.ceil(to / step); i++) {
    if (covered[i] <= allowed) { if (start < 0) start = i; }
    else if (start >= 0) { const len = i - start; if (!best || len > best.len) best = { start, len }; start = -1; }
  }
  if (start >= 0) { const len = Math.ceil(to / step) - start; if (!best || len > best.len) best = { start, len }; }
  if (!best || best.len * step < 10) return null;
  const g = (best.start + best.len / 2) * step;
  // Both sides must carry real text, or it's just a margin or an indent.
  const leftN = items.filter((p) => p.x + p.w <= g).length;
  const rightN = items.filter((p) => p.x >= g).length;
  if (leftN < items.length * 0.15 || rightN < items.length * 0.15) return null;
  // Columns must run side by side: their vertical spans have to overlap for a good part of the page.
  const span = (xs: TextPiece[]) => [Math.min(...xs.map((p) => p.y)), Math.max(...xs.map((p) => p.y))];
  const [l0, l1] = span(items.filter((p) => p.x + p.w <= g));
  const [r0, r1] = span(items.filter((p) => p.x >= g));
  const overlap = Math.min(l1, r1) - Math.max(l0, r0);
  if (overlap < Math.min(l1 - l0, r1 - r0) * 0.3) return null;
  return g;
}

/** Pieces sharing a baseline (within half a line height), top of the page first. */
function groupRows(items: TextPiece[]): TextPiece[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextPiece[][] = [];
  for (const p of sorted) {
    const row = rows[rows.length - 1];
    const tol = Math.max(2, (p.h || 10) * 0.5);
    if (row && Math.abs(row[0]!.y - p.y) <= tol) row.push(p);
    else rows.push([p]);
  }
  return rows;
}

function toLines(items: TextPiece[]): string[] {
  return groupRows(items).map((row) => {
    const parts = row.sort((a, b) => a.x - b.x);
    let line = '';
    let end = -Infinity;
    for (const p of parts) {
      // Pieces of one word sit edge to edge; a visible gap means a space.
      const gap = p.x - end;
      if (line && gap > Math.max(1, (p.h || 10) * 0.15) && !line.endsWith(' ') && !p.str.startsWith(' ')) line += ' ';
      line += p.str;
      end = p.x + p.w;
    }
    return line;
  });
}

/** Text that repeats at the top or bottom of several pages (running headers/footers) and bare page numbers. */
export function dropRunningLines(pages: string[][]): string[][] {
  const PAGE_NO = /^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i;
  // Page numbers go first, so the running footer they sat under becomes the page's last line.
  const clean = pages.map((lines) => lines.filter((l) => !PAGE_NO.test(l.trim())));
  if (clean.length < 2) return clean;
  const key = (l: string | undefined) => (l ?? '').trim().toLowerCase();
  const count = (pick: (ls: string[]) => string | undefined) => {
    const m = new Map<string, number>();
    for (const ls of clean) { const k = key(pick(ls)); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return new Set([...m].filter(([, n]) => n >= 2).map(([k]) => k));
  };
  const heads = count((ls) => ls[0]);
  const feet = count((ls) => ls[ls.length - 1]);
  return clean.map((ls) => ls.filter((l, i) => !((i === 0 && heads.has(key(l))) || (i === ls.length - 1 && feet.has(key(l))))));
}

/** Share of the page height treated as top/bottom margin, where running headers, footers and page numbers sit. */
const MARGIN = 0.06;
const PAGE_NO_ANYWHERE = /\bpage\s*\d{1,3}(\s*(of|\/)\s*\d{1,3})?\b|^\s*\d{1,3}\s*(of|\/)\s*\d{1,3}\s*$|^\s*\d{1,3}\s*$/gi;

/** A page split into its top margin, body and bottom margin (each as reading-order lines). */
export interface PageParts { top: string[]; body: string[]; bottom: string[] }

export function splitPage(pieces: TextPiece[], pageWidth: number, pageHeight: number): PageParts {
  const live = pieces.filter((p) => p.str.trim() !== '');
  const topY = pageHeight * (1 - MARGIN);
  const bottomY = pageHeight * MARGIN;
  return {
    top: layoutLines(live.filter((p) => p.y >= topY), pageWidth),
    body: layoutLines(live.filter((p) => p.y < topY && p.y > bottomY), pageWidth),
    bottom: layoutLines(live.filter((p) => p.y <= bottomY), pageWidth),
  };
}

/**
 * Join pages, dropping margin text that repeats on two or more pages (running headers/footers, compared without
 * page numbers) and page numbers. Margin text that appears once (a name banner on page 1) is kept.
 */
export function joinPages(pages: PageParts[]): string[][] {
  const key = (l: string) => l.replace(PAGE_NO_ANYWHERE, ' ').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  const seen = new Map<string, number>();
  for (const p of pages) for (const k of new Set([...p.top, ...p.bottom].map(key).filter(Boolean))) seen.set(k, (seen.get(k) ?? 0) + 1);
  const keep = (l: string) => { const k = key(l); return k !== '' && (pages.length < 2 || (seen.get(k) ?? 0) < 2); };
  const strip = (l: string) => l.replace(PAGE_NO_ANYWHERE, ' ').replace(/\s+/g, ' ').trim();
  return pages.map((p) => [...p.top.filter(keep).map(strip), ...p.body, ...p.bottom.filter(keep).map(strip)].filter(Boolean));
}

async function pdfPages(bytes: Uint8Array): Promise<{ pages: string[][]; pageCount: number; twoColumnPages: number[] }> {
  // pdf.js takes ownership of the buffer it's given; hand it a copy so the caller's bytes stay usable (hashing, reuse).
  const pdf = await getDocumentProxy(bytes.slice());
  const pageCount = pdf.numPages;
  const parts: PageParts[] = [];
  const twoColumnPages: number[] = [];
  for (let i = 1; i <= Math.min(pageCount, MAX_PAGES); i++) {
    const page = await pdf.getPage(i);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const pieces: TextPiece[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const t = it.transform as number[];
      pieces.push({ str: it.str, x: t[4]!, y: t[5]!, w: it.width ?? 0, h: it.height || Math.abs(t[3]!) || 10 });
    }
    if (findGutter(pieces.filter((x) => x.str.trim() !== ''), width) != null) twoColumnPages.push(i);
    parts.push(splitPage(pieces, width, height));
  }
  return { pages: joinPages(parts), pageCount, twoColumnPages };
}

/* ------------------------------------------------------------------ DOCX */

const XML_ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };

/**
 * Lines of a DOCX part. Paragraphs and line breaks end a line; table cells in one row are joined with " | ";
 * Word's fallback copy of each text box (mc:Fallback) and tracked deletions (w:del) are skipped, so nothing is read twice.
 */
export function docxLines(xml: string): string[] {
  const out: string[] = [];
  let line = '';
  let skip = 0; // depth inside mc:Fallback or w:del
  let cell = 0; // depth inside table cells: a row is one line
  const end = () => { out.push(line); line = ''; };
  for (const part of xml.split(/(<[^>]*>)/)) {
    if (!part) continue;
    if (part[0] === '<') {
      const name = part.match(/^<\/?\s*([\w:]+)/)?.[1] ?? '';
      const closing = part[1] === '/';
      const selfClosing = part.endsWith('/>');
      if (name === 'mc:Fallback' || name === 'w:del') { if (!selfClosing) skip += closing ? -1 : 1; continue; }
      if (skip > 0) continue;
      if (name === 'w:tc' && !selfClosing) { cell += closing ? -1 : 1; if (closing) line = line.trimEnd() + ' | '; continue; }
      if (closing && name === 'w:tr') { end(); continue; }
      if (closing && name === 'w:p') { if (cell > 0) { if (line && !line.endsWith(' ')) line += ' '; } else end(); }
      else if (name === 'w:br' || name === 'w:cr') { if (cell > 0) line += ' '; else end(); }
      else if (name === 'w:tab') line += ' ';
      continue;
    }
    if (skip > 0) continue;
    line += part.replace(/&(?:lt|gt|amp|quot|apos);/g, (e) => XML_ENTITIES[e]!);
  }
  if (line) end();
  // A table row ends up as "a | b | " plus empty paragraph lines from each cell; tidy both.
  return out.map((l) => l.replace(/(\s*\|\s*)+$/, '').replace(/^\s*\|\s*/, ''));
}

function docxAllLines(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes, {
    filter: (f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f.name) && f.originalSize <= MAX_UNZIPPED,
  });
  const part = (name: string) => (files[name] ? docxLines(strFromU8(files[name]!)) : []);
  const headers = Object.keys(files).filter((n) => /header\d*\.xml$/.test(n)).sort().flatMap(part);
  // Footers are mostly page numbers and repeated contact lines; the contact details are caught from the body/headers.
  return [...headers, ...part('word/document.xml')];
}

/* ------------------------------------------------------------------ contacts */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LINK = /\b(?:https?:\/\/|www\.)[^\s|,;)]+|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|kaggle\.com|medium\.com)\/[^\s|,;)]+/gi;
// Phone numbers: a + or digit, then 9–14 more digits with spaces, dots, dashes or brackets in between.
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,4}\d{2,5}/g;

/** Emails, phone numbers and profile links written in the text. */
export function findContacts(lines: string[]): ExtractedResume['contacts'] {
  const text = lines.join('\n');
  const uniq = (xs: string[]) => Array.from(new Set(xs));
  const emails = uniq((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()));
  const links = uniq((text.match(LINK) ?? []).map((l) => l.replace(/[.]+$/, '')));
  const phones = uniq((text.match(PHONE) ?? []).filter((p) => {
    const digits = p.replace(/\D/g, '');
    // Not years ("2019 - 2023"), date ranges or short numbers.
    return digits.length >= 10 && digits.length <= 15 && !/^(19|20)\d{2}(19|20)\d{2}$/.test(digits);
  }).map((p) => p.trim()));
  return { emails, phones, links };
}

/* ------------------------------------------------------------------ main */

const tidy = (l: string) => l.replace(/[ \t ]+/g, ' ').replace(/[​-‍﻿]/g, '').trim().slice(0, MAX_LINE_CHARS);

/** Read a resume (already sniffed as PDF or DOCX) into numbered-line form. */
export async function extractResume(bytes: Uint8Array, kind: ResumeKind): Promise<ExtractedResume> {
  let pages: string[][];
  let pageCount = 1;
  let twoColumnPages: number[] = [];
  if (kind.ext === 'pdf') {
    const r = await pdfPages(bytes);
    pages = dropRunningLines(r.pages);
    pageCount = r.pageCount;
    twoColumnPages = r.twoColumnPages;
  } else {
    pages = [docxAllLines(bytes)];
  }
  const lowTextPages = kind.ext === 'pdf'
    ? pages.map((p, i) => (p.join('').replace(/\s/g, '').length < LOW_TEXT_CHARS ? i + 1 : 0)).filter(Boolean)
    : [];
  const lines = pages.flat().map(tidy).filter((l) => l.length > 0 && !/^[|•·\-–—_*.]+$/.test(l)).slice(0, MAX_LINES);
  return {
    version: EXTRACT_VERSION,
    format: kind.ext,
    lines,
    pageCount,
    pagesRead: kind.ext === 'pdf' ? Math.min(pageCount, MAX_PAGES) : 1,
    lowTextPages,
    twoColumnPages,
    chars: lines.reduce((n, l) => n + l.length, 0),
    contacts: findContacts(lines),
  };
}

/** Lines as "L1: …" for prompts. Line numbers are 1-based, matching what the model will cite. */
export function numberLines(lines: string[]): string {
  return lines.map((l, i) => `L${i + 1}: ${l}`).join('\n');
}
