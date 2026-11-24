import { rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { drawable } from './pdf-text';
import type { BadgeSettings } from './badge-settings';

/**
 * Name badges as a PDF: an A4 sheet of 8 (cut along the guides), 4×3 inch labels for label printers, A6
 * lanyard cards, or credit-card size for plastic ID-card printers. Each badge has the name, company and role, ticket type, and the check-in QR code, drawn in the
 * event's badge design (lib/events/badge-settings.ts): one of five templates with an accent colour and the host's
 * logo, and for Pro hosts ticket type colours, chosen details, registration answers, a sponsor strip and their own
 * background artwork.
 */

export const BADGE_LAYOUTS = {
  a4: { label: 'A4 sheet, 8 per page', page: [595.28, 841.89], cols: 2, rows: 4 },
  label: { label: '4 × 3 inch label', page: [288, 216], cols: 1, rows: 1 },
  a6: { label: 'A6 card, 1 per page', page: [297.64, 419.53], cols: 1, rows: 1 },
  // ID-1 / CR80, the size of a bank card: for plastic ID-card printers (Evolis, Zebra ZC, HID Fargo).
  card: { label: 'Credit card size (85.6 × 54 mm)', page: [242.65, 153.07], cols: 1, rows: 1 },
} as const;
export type BadgeLayout = keyof typeof BADGE_LAYOUTS;
export const isBadgeLayout = (v: unknown): v is BadgeLayout => typeof v === 'string' && v in BADGE_LAYOUTS;
export const MAX_BADGES = 2000;

export type BadgePerson = {
  name: string; company: string | null; occupation: string | null; tier: string | null; qrToken: string | null;
  /** For the ticket type colour (Pro). */
  tierId?: string | null;
  /** Registration answers by question id (Pro, for the questions the design prints). */
  answers?: Record<string, string>;
};

export interface BadgeDesign {
  settings: BadgeSettings;
  logoUrl: string | null;
  /** Sponsor logos, best first (used when the design has a sponsor strip). */
  sponsorLogoUrls: string[];
  /** Labels of the questions in settings.questionIds, by id. */
  questionLabels: Record<string, string>;
}

export const INK = rgb(0.07, 0.09, 0.15);
export const MUTED = rgb(0.42, 0.45, 0.5);
export const GUIDE = rgb(0.85, 0.85, 0.85);

export function fitSize(font: PDFFont, text: string, size: number, maxWidth: number, min = 8): number {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  return s;
}

/** Cut text to fit one line, with an ellipsis. */
export function clip(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

/** Name on up to two lines, as large as fits. */
export function nameLines(font: PDFFont, name: string, maxSize: number, maxWidth: number): { lines: string[]; size: number } {
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

/** What a badge is drawn on: a PDF page, or the SVG used for the on-screen preview (see renderBadgePreviewSvg). */
export type Surface = Pick<PDFPage, 'drawRectangle' | 'drawText' | 'drawImage' | 'drawLine'>;

export function centerText(page: Surface, font: PDFFont, text: string, cx: number, y: number, size: number, color = INK) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

// ── One badge ─────────────────────────────────────────────────────────────────

export const WHITE = rgb(1, 1, 1);
export const DARK_BG = rgb(0.07, 0.08, 0.11);

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Black or white, whichever reads better on this colour. */
export function textOn(c: RGB): RGB {
  const lum = 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue;
  return lum > 0.6 ? INK : WHITE;
}

export type Cell = { x0: number; top: number; bw: number; bh: number; portrait: boolean };
export type Ctx = {
  st: BadgeSettings; bold: PDFFont; regular: PDFFont; title: string; date: string;
  logo: PDFImage | null; background: PDFImage | null; sponsorImgs: PDFImage[]; qr: PDFImage | null;
  questionLabels: Record<string, string>;
};

export function fitImage(img: PDFImage, maxW: number, maxH: number) {
  const s = Math.min(maxW / img.width, maxH / img.height);
  return { width: img.width * s, height: img.height * s };
}

export function drawBadge(pg: Surface, cell: Cell, p: BadgePerson, c: Ctx) {
  const { x0, top, bw, bh, portrait } = cell;
  const { st, bold, regular } = c;
  const accent = hexToRgb(st.accent);
  const tierColor = p.tierId && st.tierColors[p.tierId] ? hexToRgb(st.tierColors[p.tierId]) : null;
  const pad = Math.min(bw, bh) * 0.08;
  const textWidth = bw - pad * 2;
  const cx = x0 + bw / 2;
  const bottomY = top - bh;

  // Background and colours.
  const darkTheme = c.background ? st.textColor === 'light' : st.template === 'dark';
  const ink = darkTheme ? WHITE : INK;
  const muted = darkTheme ? rgb(0.78, 0.8, 0.84) : MUTED;
  if (c.background) pg.drawImage(c.background, { x: x0, y: bottomY, width: bw, height: bh });
  else if (st.template === 'dark') pg.drawRectangle({ x: x0, y: bottomY, width: bw, height: bh, color: DARK_BG });

  // Bottom: conference stripe, then the sponsor strip above it.
  let floor = bottomY + pad;
  const tierText = st.fields.tier && p.tier ? drawable(bold, p.tier.toUpperCase()) : '';
  if (st.template === 'conference') {
    const h = bh * 0.13;
    const fill = tierColor ?? accent;
    pg.drawRectangle({ x: x0, y: bottomY, width: bw, height: h, color: fill });
    if (tierText) {
      const s = fitSize(bold, tierText, portrait ? 14 : 11, textWidth, 7);
      centerText(pg, bold, clip(bold, tierText, s, textWidth), cx, bottomY + (h - s * 0.72) / 2, s, textOn(fill));
    }
    floor = bottomY + h + pad * 0.6;
  }
  if (c.sponsorImgs.length) {
    const h = bh * 0.1;
    const n = c.sponsorImgs.length;
    const slotW = textWidth / n;
    c.sponsorImgs.forEach((img, k) => {
      const { width, height } = fitImage(img, slotW * 0.8, h * 0.8);
      pg.drawImage(img, { x: x0 + pad + slotW * k + (slotW - width) / 2, y: floor + (h - height) / 2, width, height });
    });
    floor += h + pad * 0.4;
  }

  // Top: Bold has a coloured band with the event name; the others print it small, with the logo above.
  let y = top - pad;
  const titleSize = fitSize(bold, c.title, portrait ? 12 : 9, textWidth, 6.5);
  if (st.template === 'bold') {
    const h = bh * (portrait ? 0.2 : 0.24);
    pg.drawRectangle({ x: x0, y: top - h, width: bw, height: h, color: accent });
    const on = textOn(accent);
    let left = x0 + pad;
    if (c.logo) {
      const { width, height } = fitImage(c.logo, h * 1.6, h * 0.6);
      pg.drawRectangle({ x: left - 3, y: top - h / 2 - height / 2 - 3, width: width + 6, height: height + 6, color: WHITE });
      pg.drawImage(c.logo, { x: left, y: top - h / 2 - height / 2, width, height });
      left += width + pad * 0.8;
    }
    const tw = x0 + bw - pad - left;
    const s = fitSize(bold, c.title, portrait ? 13 : 10, tw, 6.5);
    pg.drawText(clip(bold, c.title, s, tw), { x: left, y: top - h / 2 + (c.date ? s * 0.15 : -s * 0.35), size: s, font: bold, color: on });
    if (c.date) pg.drawText(clip(regular, c.date, s * 0.8, tw), { x: left, y: top - h / 2 - s * 0.95, size: s * 0.8, font: regular, color: on });
    y = top - h - pad * 0.8;
  } else {
    if (c.logo) {
      const { width, height } = fitImage(c.logo, textWidth * 0.5, Math.min(bh * 0.11, 30));
      pg.drawImage(c.logo, { x: cx - width / 2, y: y - height, width, height });
      y -= height + titleSize * 0.7;
    }
    centerText(pg, bold, clip(bold, c.title, titleSize, textWidth), cx, y - titleSize, titleSize, muted);
    y -= titleSize * 1.25;
    if (c.date) {
      centerText(pg, regular, clip(regular, c.date, titleSize * 0.85, textWidth), cx, y - titleSize * 0.85, titleSize * 0.85, muted);
      y -= titleSize * 1.1;
    }
    if (st.template === 'classic') {
      pg.drawLine({ start: { x: cx - textWidth * 0.12, y: y - titleSize * 0.5 }, end: { x: cx + textWidth * 0.12, y: y - titleSize * 0.5 }, thickness: 1.5, color: accent });
      y -= titleSize * 0.8;
    }
  }

  // QR at the bottom: left, middle or right ("auto": middle on tall badges, right on wide ones). The ticket type goes
  // above the QR when they're stacked, or at the other side on wide badges.
  const qrSize = c.qr ? (portrait ? bw * 0.38 : bh * 0.34) : 0;
  const pos = st.qrPosition === 'auto' ? (portrait ? 'center' : 'right') : st.qrPosition;
  const stacked = portrait || pos === 'center' || !c.qr;
  const qx = pos === 'left' ? x0 + pad : pos === 'right' ? x0 + bw - pad - qrSize : cx - qrSize / 2;
  const showTierHere = st.template !== 'conference' && tierText;
  const tierSize = portrait ? 11 : 9;
  if (c.qr) {
    if (darkTheme) pg.drawRectangle({ x: qx - 4, y: floor - 4, width: qrSize + 8, height: qrSize + 8, color: WHITE });
    pg.drawImage(c.qr, { x: qx, y: floor, width: qrSize, height: qrSize });
  }
  let blockFloor = floor + (stacked && c.qr ? qrSize + pad * 0.6 : 0);
  if (showTierHere) {
    const tw = stacked ? textWidth : textWidth - qrSize - pad;
    const text = clip(bold, tierText, tierSize, tw * 0.9);
    const w = bold.widthOfTextAtSize(text, tierSize);
    const ty = stacked ? blockFloor : floor + 2;
    // Stacked: centred over the QR (kept inside the badge). Side by side: at the other edge from the QR.
    const over = c.qr ? qx + qrSize / 2 : cx;
    const tx = stacked
      ? Math.min(x0 + bw - pad - w, Math.max(x0 + pad, over - w / 2))
      : pos === 'left' ? x0 + bw - pad - w : x0 + pad;
    // A coloured label for ticket type colours, and on dark badges (coloured text on near-black is hard to read).
    const pill = tierColor ?? (darkTheme ? accent : null);
    if (pill) {
      pg.drawRectangle({ x: tx - 5, y: ty - 3.5, width: w + 10, height: tierSize + 6, color: pill });
      pg.drawText(text, { x: tx, y: ty, size: tierSize, font: bold, color: textOn(pill) });
    } else {
      pg.drawText(text, { x: tx, y: ty, size: tierSize, font: bold, color: st.template === 'classic' ? ink : accent });
    }
    if (stacked) blockFloor += tierSize + 8;
  }

  // The person: name, role and company, and up to two registration answers.
  const name = drawable(bold, p.name) || 'Guest';
  const { lines, size } = nameLines(bold, name, portrait ? 30 : 22, textWidth);
  const subText = drawable(regular, [st.fields.role ? p.occupation : null, st.fields.company ? p.company : null].filter(Boolean).join(', '));
  const subSize = subText ? fitSize(regular, subText, portrait ? 12 : 10, textWidth, 7) : 0;
  const answers = st.questionIds
    .map((id) => {
      const a = p.answers?.[id]?.trim();
      const label = c.questionLabels[id];
      return a && label ? drawable(regular, `${label}: ${a}`) : '';
    })
    .filter(Boolean);
  const ansSize = portrait ? 9.5 : 8;
  const minimalGap = st.template === 'minimal' ? size * 0.7 : 0;
  const blockH = minimalGap + size * lines.length * 1.1 + (subText ? size * 0.55 + subSize * 1.4 : 0) + answers.length * ansSize * 1.35;
  const spare = Math.max(0, y - (portrait ? 18 : 6) - blockFloor - blockH);
  let nameTop = y - (portrait ? 18 : 6);
  if (st.textPosition === 'center') nameTop -= spare / 2;
  else if (st.textPosition === 'bottom') nameTop -= spare;

  if (st.template === 'minimal') {
    pg.drawRectangle({ x: cx - 14, y: nameTop - 2.5, width: 28, height: 2.5, color: accent });
    nameTop -= minimalGap;
  }
  // On wide badges the QR sits beside the text: a line that reaches down to the QR's height stays in the space
  // next to it (centred there, shrunk or cut to fit), so text never runs into the code.
  // Dark badges put the QR on a white backing 4pt larger on each side: keep clear of that too.
  const plate = darkTheme ? 4 : 0;
  const qrTop = floor + qrSize + plate + 3;
  const lane = (baseline: number): { cx: number; width: number } => {
    if (stacked || !c.qr || baseline > qrTop) return { cx, width: textWidth };
    const gap = pad * 0.6 + plate;
    const [l, r] = pos === 'left' ? [qx + qrSize + gap, x0 + bw - pad] : [x0 + pad, qx - gap];
    return { cx: (l + r) / 2, width: Math.max(20, r - l) };
  };
  const line = (font: PDFFont, text: string, baseline: number, wanted: number, color: RGB, minSize: number) => {
    const { cx: lx, width } = lane(baseline);
    const sz = fitSize(font, text, wanted, width, Math.min(wanted, minSize));
    centerText(pg, font, clip(font, text, sz, width), lx, baseline, sz, color);
  };
  lines.forEach((ln, k) => line(bold, ln, nameTop - size * (k + 1) * 1.1, size, ink, size * 0.6));
  let ty = nameTop - size * lines.length * 1.1 - size * 0.55;
  if (subText) {
    line(regular, subText, ty - subSize, subSize, muted, 6.5);
    ty -= subSize * 1.4;
  }
  for (const a of answers) {
    line(regular, a, ty - ansSize, ansSize, muted, 6.5);
    ty -= ansSize * 1.35;
  }
}
