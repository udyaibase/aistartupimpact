import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { drawable } from './certificate-pdf';

/**
 * Name badges as a PDF: an A4 sheet of 8 (cut along the guides), 4×3 inch labels for label printers, or A6
 * lanyard cards. Each badge has the name, company and role, ticket type, and the check-in QR code.
 */

export const BADGE_LAYOUTS = {
  a4: { label: 'A4 sheet, 8 per page', page: [595.28, 841.89], cols: 2, rows: 4 },
  label: { label: '4 × 3 inch label', page: [288, 216], cols: 1, rows: 1 },
  a6: { label: 'A6 card, 1 per page', page: [297.64, 419.53], cols: 1, rows: 1 },
} as const;
export type BadgeLayout = keyof typeof BADGE_LAYOUTS;
export const isBadgeLayout = (v: unknown): v is BadgeLayout => typeof v === 'string' && v in BADGE_LAYOUTS;
export const MAX_BADGES = 2000;

export type BadgePerson = { name: string; company: string | null; occupation: string | null; tier: string | null; qrToken: string | null };

const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const GUIDE = rgb(0.85, 0.85, 0.85);

function fitSize(font: PDFFont, text: string, size: number, maxWidth: number, min = 8): number {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  return s;
}

/** Cut text to fit one line, with an ellipsis. */
function clip(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

/** Name on up to two lines, as large as fits. */
function nameLines(font: PDFFont, name: string, maxSize: number, maxWidth: number): { lines: string[]; size: number } {
  const one = fitSize(font, name, maxSize, maxWidth, maxSize * 0.6);
  if (font.widthOfTextAtSize(name, one) <= maxWidth) return { lines: [name], size: one };
  const words = name.split(' ');
  if (words.length > 1) {
    for (let size = maxSize * 0.85; size >= maxSize * 0.45; size -= 0.5) {
      let first = '';
      for (const w of words) {
        const next = first ? `${first} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > maxWidth) break;
        first = next;
      }
      const rest = name.slice(first.length).trim();
      if (first && font.widthOfTextAtSize(rest, size) <= maxWidth) return { lines: [first, rest], size };
    }
  }
  const size = maxSize * 0.45;
  return { lines: [clip(font, name, size, maxWidth)], size };
}

function centerText(page: PDFPage, font: PDFFont, text: string, cx: number, y: number, size: number, color = INK) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

export async function renderBadgesPdf(opts: { eventTitle: string; eventDate: string; layout: BadgeLayout; people: BadgePerson[] }): Promise<Uint8Array> {
  const L = BADGE_LAYOUTS[opts.layout];
  const doc = await PDFDocument.create();
  doc.setTitle(`Badges - ${opts.eventTitle}`.slice(0, 200));
  doc.setCreator('Udyaibase');
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const [pw, ph] = L.page;
  const bw = pw / L.cols;
  const bh = ph / L.rows;
  const perPage = L.cols * L.rows;
  const title = drawable(bold, opts.eventTitle);
  const date = drawable(regular, opts.eventDate);
  const people = opts.people.slice(0, MAX_BADGES);
  if (!people.length) doc.addPage([pw, ph]);

  let page: PDFPage | null = null;
  for (const [i, p] of people.entries()) {
    const slot = i % perPage;
    if (slot === 0) {
      page = doc.addPage([pw, ph]);
      if (perPage > 1) {
        // Cut guides between badges.
        for (let c = 1; c < L.cols; c++) page.drawLine({ start: { x: c * bw, y: 0 }, end: { x: c * bw, y: ph }, thickness: 0.5, color: GUIDE, dashArray: [3, 3] });
        for (let r = 1; r < L.rows; r++) page.drawLine({ start: { x: 0, y: r * bh }, end: { x: pw, y: r * bh }, thickness: 0.5, color: GUIDE, dashArray: [3, 3] });
      }
    }
    const pg = page!;
    const col = slot % L.cols;
    const row = Math.floor(slot / L.cols);
    const x0 = col * bw;
    const top = ph - row * bh;
    const pad = Math.min(bw, bh) * 0.08;
    const portrait = bh > bw;
    const qrSize = portrait ? bw * 0.42 : bh * 0.36;
    const textWidth = bw - pad * 2;
    const cx = x0 + bw / 2;

    // Event title band.
    const titleSize = fitSize(bold, title, portrait ? 12 : 9, textWidth, 6.5);
    centerText(pg, bold, clip(bold, title, titleSize, textWidth), cx, top - pad - titleSize, titleSize, MUTED);
    if (date) centerText(pg, regular, clip(regular, date, titleSize * 0.85, textWidth), cx, top - pad - titleSize * 2.2, titleSize * 0.85, MUTED);

    // Name, then company and role.
    const name = drawable(bold, p.name) || 'Guest';
    const { lines, size } = nameLines(bold, name, portrait ? 30 : 22, textWidth);
    const nameTop = top - pad - titleSize * 3.4 - (portrait ? 18 : 6);
    lines.forEach((ln, k) => centerText(pg, bold, ln, cx, nameTop - size * (k + 1) * 1.1, size));
    let y = nameTop - size * lines.length * 1.1 - size * 0.55;
    const sub = drawable(regular, [p.occupation, p.company].filter(Boolean).join(', '));
    if (sub) {
      const s = fitSize(regular, sub, portrait ? 12 : 10, textWidth, 7);
      centerText(pg, regular, clip(regular, sub, s, textWidth), cx, y - s, s, MUTED);
      y -= s * 1.4;
    }

    // QR (check-in) at the bottom, ticket type beside or above it.
    const bottom = top - bh + pad;
    if (p.qrToken) {
      const png = await QRCode.toBuffer(p.qrToken, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
      const img = await doc.embedPng(png);
      const qx = portrait ? cx - qrSize / 2 : x0 + bw - pad - qrSize;
      pg.drawImage(img, { x: qx, y: bottom, width: qrSize, height: qrSize });
    }
    if (p.tier) {
      const tier = drawable(bold, p.tier.toUpperCase());
      const s = portrait ? 11 : 9;
      const tw = portrait ? textWidth : textWidth - qrSize - pad;
      const text = clip(bold, tier, s, tw);
      if (portrait) centerText(pg, bold, text, cx, bottom + qrSize + s * 0.8, s);
      else pg.drawText(text, { x: x0 + pad, y: bottom + 2, size: s, font: bold, color: INK });
    }
  }
  return doc.save();
}
