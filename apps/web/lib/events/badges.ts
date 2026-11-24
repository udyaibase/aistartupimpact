import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import { drawable, loadImage, loadImagePng } from './certificate-pdf';
import { DEFAULT_BADGE_SETTINGS, type BadgeSettings } from './badge-settings';
import { cleanBadgeSvg, fillBadgeMarkers, prepareBadgeDesign, type PreparedBadgeDesign } from './badge-custom-server';
import { qrBox, viewBoxOf } from './certificate-custom';
import {
  BADGE_LAYOUTS, GUIDE, MAX_BADGES, WHITE, clip, drawBadge, fitSize,
  type BadgeDesign, type BadgeLayout, type BadgePerson, type Cell, type Surface,
} from './badge-draw';

/**
 * Badge PDFs (server). The layouts and the drawing of one badge are in badge-draw.ts, shared with the instant preview
 * on the Badges page; this file adds the PDF itself, the host's own design (Pro), and the server-drawn preview.
 */
export { BADGE_LAYOUTS, MAX_BADGES, isBadgeLayout, hexToRgb } from './badge-draw';
export type { BadgeDesign, BadgeLayout, BadgePerson } from './badge-draw';

export async function renderBadgesPdf(opts: { eventTitle: string; eventDate: string; layout: BadgeLayout; people: BadgePerson[]; design?: BadgeDesign }): Promise<Uint8Array> {
  const L = BADGE_LAYOUTS[opts.layout];
  const design = opts.design ?? { settings: DEFAULT_BADGE_SETTINGS, logoUrl: null, sponsorLogoUrls: [], questionLabels: {} };
  const st = design.settings;
  const doc = await PDFDocument.create();
  doc.setTitle(`Badges - ${opts.eventTitle}`.slice(0, 200));
  doc.setCreator('Udyaibase');
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const [pw, ph] = L.page;
  const bw = pw / L.cols;
  const bh = ph / L.rows;
  const perPage = L.cols * L.rows;
  const portrait = bh > bw;

  // Images once per document (each badge reuses them). About 300 dpi for the background.
  const sponsorUrls = st.sponsorStrip ? design.sponsorLogoUrls.slice(0, 4) : [];
  const [logo, background, ...sponsors] = await Promise.all([
    st.showLogo ? loadImage(doc, design.logoUrl, 600) : Promise.resolve(null),
    st.backgroundUrl ? loadImage(doc, st.backgroundUrl, 0, { width: Math.round(bw * 4.17), height: Math.round(bh * 4.17) }) : Promise.resolve(null),
    ...sponsorUrls.map((u) => loadImage(doc, u, 400)),
  ]);
  const sponsorImgs = sponsors.filter((x): x is PDFImage => !!x);

  const title = drawable(bold, opts.eventTitle);
  const date = drawable(regular, opts.eventDate);
  const people = opts.people.slice(0, MAX_BADGES);
  const qrCache = new Map<string, PDFImage>();
  // The host's own design: its artwork becomes one image for the whole run (see badge-custom-server.ts).
  const custom = st.template === 'custom' && st.customSvg ? await prepareCustom(doc, st.customSvg, opts.eventTitle, opts.eventDate, bw, bh) : null;
  if (!people.length) doc.addPage([pw, ph]);

  let page: PDFPage | null = null;
  for (const [i, p] of people.entries()) {
    const slot = i % perPage;
    if (slot === 0) page = doc.addPage([pw, ph]);
    const pg = page!;
    const col = slot % L.cols;
    const row = Math.floor(slot / L.cols);
    let qr: PDFImage | null = null;
    if (st.fields.qr && p.qrToken) {
      qr = qrCache.get(p.qrToken) ?? null;
      if (!qr) {
        qr = await doc.embedPng(await QRCode.toBuffer(p.qrToken, { margin: 0, width: 300, errorCorrectionLevel: 'M' }));
        qrCache.set(p.qrToken, qr);
      }
    }
    const cell = { x0: col * bw, top: ph - row * bh, bw, bh, portrait };
    if (custom) drawCustomBadge(pg, cell, p, { ...custom, st, bold, regular, qr });
    else drawBadge(pg, cell, p, { st, bold, regular, title, date, logo, background, sponsorImgs, qr, questionLabels: design.questionLabels });
    // Cut guides last, so a dark or full-bleed badge doesn't hide them.
    if (slot === perPage - 1 || i === people.length - 1) {
      if (perPage > 1) {
        for (let c = 1; c < L.cols; c++) pg.drawLine({ start: { x: c * bw, y: 0 }, end: { x: c * bw, y: ph }, thickness: 0.5, color: GUIDE, dashArray: [3, 3] });
        for (let r = 1; r < L.rows; r++) pg.drawLine({ start: { x: 0, y: r * bh }, end: { x: pw, y: r * bh }, thickness: 0.5, color: GUIDE, dashArray: [3, 3] });
      }
    }
  }
  return doc.save();
}

// ── On-screen preview (SVG) ───────────────────────────────────────────────────

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const css = (c: RGB | undefined) => (c ? `rgb(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)})` : '#000');

/**
 * One sample badge as an SVG image, drawn by the same code as the PDF, for the Badges page preview. A PDF in a frame
 * shows nothing on Android phones (and in some browsers), while an SVG image shows everywhere. Images are inlined,
 * so the SVG is self-contained (it is shown with <img>, which runs no scripts).
 */
export async function renderBadgePreviewSvg(opts: { eventTitle: string; eventDate: string; layout: BadgeLayout; person: BadgePerson; design: BadgeDesign }): Promise<string> {
  const L = BADGE_LAYOUTS[opts.layout === 'a4' ? 'a6' : opts.layout];
  const [W, H] = L.page;
  const st = opts.design.settings;
  if (st.template === 'custom' && st.customSvg) {
    const own = await ownDesignPreview(st, opts);
    if (own) return own;
  }
  // pdf-lib is still used for font measurements and image sizes; nothing is drawn into this document.
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const uri = new Map<PDFImage, string>();
  const embed = async (png: Buffer | null) => {
    if (!png) return null;
    const img = await doc.embedPng(png);
    uri.set(img, `data:image/png;base64,${png.toString('base64')}`);
    return img;
  };
  const sponsorUrls = st.sponsorStrip ? opts.design.sponsorLogoUrls.slice(0, 4) : [];
  const [logoPng, bgPng, ...sponsorPngs] = await Promise.all([
    st.showLogo ? loadImagePng(opts.design.logoUrl, 600) : Promise.resolve(null),
    st.backgroundUrl ? loadImagePng(st.backgroundUrl, 0, { width: Math.round(W * 2), height: Math.round(H * 2) }) : Promise.resolve(null),
    ...sponsorUrls.map((u) => loadImagePng(u, 300)),
  ]);
  const logo = await embed(logoPng);
  const background = await embed(bgPng);
  const sponsorImgs = (await Promise.all(sponsorPngs.map(embed))).filter((x): x is PDFImage => !!x);
  const qr = st.fields.qr && opts.person.qrToken
    ? await embed(await QRCode.toBuffer(opts.person.qrToken, { margin: 0, width: 300, errorCorrectionLevel: 'M' }))
    : null;

  const out: string[] = [];
  const surface = {
    drawRectangle: (o: { x: number; y: number; width: number; height: number; color?: RGB }) => {
      out.push(`<rect x="${o.x}" y="${H - o.y - o.height}" width="${o.width}" height="${o.height}" fill="${css(o.color)}"/>`);
    },
    drawText: (text: string, o: { x: number; y: number; size: number; font: PDFFont; color?: RGB }) => {
      const weight = o.font === bold ? 700 : 400;
      out.push(`<text x="${o.x}" y="${H - o.y}" font-family="Helvetica, Arial, sans-serif" font-size="${o.size}" font-weight="${weight}" fill="${css(o.color)}">${esc(text)}</text>`);
    },
    drawImage: (img: PDFImage, o: { x: number; y: number; width: number; height: number }) => {
      const href = uri.get(img);
      if (href) out.push(`<image href="${href}" x="${o.x}" y="${H - o.y - o.height}" width="${o.width}" height="${o.height}" preserveAspectRatio="none"/>`);
    },
    drawLine: (o: { start: { x: number; y: number }; end: { x: number; y: number }; thickness?: number; color?: RGB }) => {
      out.push(`<line x1="${o.start.x}" y1="${H - o.start.y}" x2="${o.end.x}" y2="${H - o.end.y}" stroke="${css(o.color)}" stroke-width="${o.thickness ?? 1}"/>`);
    },
  } as unknown as Surface;

  drawBadge(surface, { x0: 0, top: H, bw: W, bh: H, portrait: H > W }, opts.person, {
    st, bold, regular, title: drawable(bold, opts.eventTitle), date: drawable(regular, opts.eventDate),
    logo, background, sponsorImgs, qr, questionLabels: opts.design.questionLabels,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
}

// ── The host's own design (Pro) ───────────────────────────────────────────────

type Custom = { prepared: PreparedBadgeDesign; art: PDFImage | null; scale: number; ox: number; oy: number; dw: number; dh: number };

/** Fit the design inside a badge (keeping its shape, centred) and turn its artwork into one image, ~300 dpi. */
async function prepareCustom(doc: PDFDocument, svg: string, event: string, date: string, bw: number, bh: number): Promise<Custom | null> {
  const prepared = prepareBadgeDesign(svg, { event, date });
  if (!prepared) return null;
  const vb = prepared.viewBox;
  const scale = Math.min(bw / vb.width, bh / vb.height);
  const dw = vb.width * scale, dh = vb.height * scale;
  let art: PDFImage | null = null;
  try {
    const sharp = (await import('sharp')).default;
    const png = await sharp(Buffer.from(prepared.background), { density: 300, limitInputPixels: 40_000_000 })
      .resize({ width: Math.round(dw * 4.17), height: Math.round(dh * 4.17), fit: 'fill' }).png().timeout({ seconds: 15 }).toBuffer();
    art = await doc.embedPng(png);
  } catch (e) {
    console.error('[badge custom design]', e instanceof Error ? e.message : e);
  }
  return { prepared, art, scale, ox: (bw - dw) / 2, oy: (bh - dh) / 2, dw, dh };
}

function personValues(p: BadgePerson, st: BadgeSettings): Record<string, string> {
  const [q1, q2] = st.questionIds;
  return {
    name: p.name || 'Guest', company: p.company ?? '', role: p.occupation ?? '', ticket: p.tier ?? '',
    answer1: (q1 && p.answers?.[q1]) || '', answer2: (q2 && p.answers?.[q2]) || '',
  };
}

function drawCustomBadge(pg: Surface, cell: Cell, p: BadgePerson, c: Custom & { st: BadgeSettings; bold: PDFFont; regular: PDFFont; qr: PDFImage | null }) {
  const { x0, top, bw, bh } = cell;
  const { prepared, scale, ox, oy, dw, dh } = c;
  const vb = prepared.viewBox;
  const left = x0 + ox;
  const designTop = top - oy;
  if (c.art) pg.drawImage(c.art, { x: left, y: designTop - dh, width: dw, height: dh });

  // Each person's details where the design put them, shrunk to fit if a name is long.
  const values = personValues(p, c.st);
  for (const slot of prepared.slots) {
    const font = slot.bold ? c.bold : c.regular;
    // A line whose placeholders are all empty (no role, no company) is left out, not printed as a lone "at".
    const keys = [...slot.template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
    if (keys.length && keys.every((k) => !(values[k] ?? '').trim())) continue;
    // Plain text for the PDF (no escaping needed: it's drawn as text, not markup).
    const text = drawable(font, slot.template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_m, k: string) => values[k] ?? '').replace(/\s+/g, ' ').trim());
    if (!text) continue;
    const room = slot.anchor === 'middle' ? 2 * Math.min(slot.x - vb.x, vb.x + vb.width - slot.x)
      : slot.anchor === 'end' ? slot.x - vb.x : vb.x + vb.width - slot.x;
    const maxW = Math.max(10, (room - 8) * scale);
    const size = fitSize(font, text, slot.size * scale, maxW, slot.size * scale * 0.5);
    const shown = clip(font, text, size, maxW);
    const w = font.widthOfTextAtSize(shown, size);
    const x = left + (slot.x - vb.x) * scale - (slot.anchor === 'middle' ? w / 2 : slot.anchor === 'end' ? w : 0);
    const y = designTop - (slot.y - vb.y) * scale;
    pg.drawText(shown, { x, y, size, font, color: rgb(...slot.color) });
  }

  // QR in the design's box (on white, so it always scans), else at the bottom where the QR position setting says.
  if (c.qr) {
    const box = prepared.qr;
    let size: number, qx: number, qy: number;
    if (box) {
      size = box.size * scale;
      qx = left + (box.x - vb.x) * scale;
      qy = designTop - (box.y - vb.y) * scale - size;
    } else {
      size = Math.min(bw, bh) * 0.3;
      const pad = Math.min(bw, bh) * 0.08;
      const pos = c.st.qrPosition === 'auto' ? 'center' : c.st.qrPosition;
      qx = pos === 'left' ? x0 + pad : pos === 'right' ? x0 + bw - pad - size : x0 + bw / 2 - size / 2;
      qy = top - bh + pad;
    }
    pg.drawRectangle({ x: qx - 3, y: qy - 3, width: size + 6, height: size + 6, color: WHITE });
    pg.drawImage(c.qr, { x: qx, y: qy, width: size, height: size });
  }
}

/** The host's own design with every placeholder filled (escaped) and a sample QR in its box, for the preview. */
async function ownDesignPreview(st: BadgeSettings, opts: { eventTitle: string; eventDate: string; person: BadgePerson }): Promise<string | null> {
  const svg = cleanBadgeSvg(st.customSvg);
  if (!svg) return null;
  const filled = fillBadgeMarkers(svg, { ...personValues(opts.person, st), event: opts.eventTitle, date: opts.eventDate });
  if (!st.fields.qr || !opts.person.qrToken) return filled;
  const vb = viewBoxOf(svg);
  const box = qrBox(svg) ?? (() => {
    const size = Math.min(vb.width, vb.height) * 0.3;
    const pad = Math.min(vb.width, vb.height) * 0.08;
    const x = st.qrPosition === 'left' ? vb.x + pad : st.qrPosition === 'right' ? vb.x + vb.width - pad - size : vb.x + vb.width / 2 - size / 2;
    return { x, y: vb.y + vb.height - pad - size, size };
  })();
  const png = await QRCode.toBuffer(opts.person.qrToken, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
  const qr = `<rect x="${box.x - 3}" y="${box.y - 3}" width="${box.size + 6}" height="${box.size + 6}" fill="#fff"/><image href="data:image/png;base64,${png.toString('base64')}" x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}"/>`;
  const end = filled.lastIndexOf('</svg>');
  return end < 0 ? filled : `${filled.slice(0, end)}${qr}</svg>`;
}
