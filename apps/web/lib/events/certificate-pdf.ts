import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { drawable } from './pdf-text';
import QRCode from 'qrcode';
import type { CertificateTemplate } from './after-event';
import { isOwnMediaUrl } from './urls';
import { CERTIFICATE_PAGE, CERTIFICATE_THEMES, TECH_BAND_HOST, type Triple } from './certificate-themes';
import { fillMarkers, qrBox, viewBoxOf } from './certificate-custom';
import { sanitizeCustomSvg } from './certificate-custom-server';

/**
 * Certificate PDF (A4 landscape) in one of six templates, with the host's logo and signature and a QR code that
 * opens the public verification page. Images are fetched only from our own media hosts, with a timeout and size cap.
 * Standard PDF fonts cover Latin text only, so other characters are swapped for close equivalents or dropped.
 */

export interface CertificateData {
  template: CertificateTemplate;
  title: string;
  recipientName: string;
  eventTitle: string;
  /** "16 November 2026 · Bengaluru" */
  dateLine: string;
  hostName: string;
  logoUrl: string | null;
  signerName: string;
  signerTitle: string;
  signatureUrl: string | null;
  code: string;
  verifyUrl: string;
  /** Free-host events keep a small "Issued via Udyaibase Events" line. */
  showBranding: boolean;
  /** "participated in", "successfully completed"… Defaults to "participated in". */
  phrase?: string;
  /** One sentence about the event, under the date. */
  description?: string;
  /** What people learned or worked on: "Topics covered". */
  skills?: string[];
  /** "6 hours": only for the {{duration}} marker of a host's own design (built-in designs print it in dateLine). */
  duration?: string;
  /** A second logo beside the first. */
  partnerLogoUrl?: string | null;
  logoPosition?: 'center' | 'left' | 'right';
  logoSize?: 'small' | 'medium' | 'large';
  /** Print the host's name as well as the logo. */
  showHostName?: boolean;
  /** Logo height in points; overrides logoSize. */
  logoHeight?: number | null;
  /** Points to move the logo right and down from its place. */
  logoOffsetX?: number;
  logoOffsetY?: number;
  /** White plate behind the logo on dark areas. Default on. */
  logoPlate?: boolean;
  /** The host's own design (SVG). Drawn when template is "custom"; if it can't be, Classic is drawn. */
  customSvg?: string;
}

const LOGO_HEIGHT = { small: 38, medium: 56, large: 74 } as const;

const LOGO_GAP = 22;
type LogoPlace = { position: 'center' | 'left' | 'right'; maxHeight: number; maxWidth: number; dx: number; dy: number; plate: boolean };

/** The logo's height in points: the slider's value, else the small / medium / large choice. */
const logoHeightOf = (d: CertificateData) => Math.min(74, Math.max(24, d.logoHeight ?? LOGO_HEIGHT[d.logoSize ?? 'medium']));

/** Height the logo row will take, without drawing it (0 when there is no logo). */
function logoRowHeight(images: PDFImage[], place: Pick<LogoPlace, 'maxHeight' | 'maxWidth'>): number {
  return images.length ? Math.max(...images.map((img) => img.scaleToFit(place.maxWidth, place.maxHeight).height)) : 0;
}

/**
 * Draws the logo, and a partner logo beside it, in a row whose top edge is `top`. `dx` and `dy` nudge it right and
 * down. On a dark area a white plate goes behind it, so a logo made for white paper can still be seen.
 * Returns the row's height (0 when there is no logo).
 */
function drawLogos(page: PDFPage, images: PDFImage[], top: number, place: LogoPlace): number {
  if (!images.length) return 0;
  const sized = images.map((img) => ({ img, ...img.scaleToFit(place.maxWidth, place.maxHeight) }));
  const total = sized.reduce((w, s) => w + s.width, 0) + LOGO_GAP * (sized.length - 1);
  const height = Math.max(...sized.map((s) => s.height));
  const left = (place.position === 'left' ? 72 : place.position === 'right' ? W - 72 - total : (W - total) / 2) + place.dx;
  const rowTop = top - place.dy;
  if (place.plate) {
    const pad = 7, r = 6;
    const px = left - pad, pw = total + pad * 2, ph = height + pad * 2;
    // A rounded rectangle; SVG paths are drawn with y running down from the given point.
    page.drawSvgPath(`M ${r} 0 H ${pw - r} Q ${pw} 0 ${pw} ${r} V ${ph - r} Q ${pw} ${ph} ${pw - r} ${ph} H ${r} Q 0 ${ph} 0 ${ph - r} V ${r} Q 0 0 ${r} 0 Z`, { x: px, y: rowTop + pad, color: rgb(1, 1, 1) });
  }
  let x = left;
  for (const s of sized) {
    page.drawImage(s.img, { x, y: rowTop - height + (height - s.height) / 2, width: s.width, height: s.height });
    x += s.width + LOGO_GAP;
  }
  return height;
}

/**
 * A host's own design: their SVG, with the markers filled in, becomes the page. The QR code, the certificate ID and
 * the verify address are always drawn by us on top, so a design can't leave them out or fake them. Null when the
 * design can't be drawn (the caller then draws Classic).
 */
async function renderCustomPage(doc: PDFDocument, page: PDFPage, d: CertificateData): Promise<boolean> {
  const svg = sanitizeCustomSvg(d.customSvg);
  if (!svg) return false;
  try {
    const filled = fillMarkers(svg, {
      name: d.recipientName, event: d.eventTitle, date: d.dateLine, title: d.title, host: d.hostName, phrase: d.phrase || 'participated in',
      description: d.description ?? '', topics: (d.skills ?? []).join('  ·  '), duration: d.duration ?? '',
      signer: d.signerName || d.hostName, signer_title: d.signerTitle || 'Organizer', certificate_id: d.code,
    });
    const sharp = (await import('sharp')).default;
    // About 300 dots per inch across an A4 page: sharp on screen and in print.
    const png = await sharp(Buffer.from(filled), { density: 216, limitInputPixels: 40_000_000 }).resize({ width: 2526, height: 1785, fit: 'fill' }).png().timeout({ seconds: 10 }).toBuffer();
    page.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: W, height: H });

    const [logo, partner] = await Promise.all([loadImage(doc, d.logoUrl), loadImage(doc, d.partnerLogoUrl ?? null)]);
    drawLogos(page, [logo, partner].filter((i): i is PDFImage => !!i), H - 34, { position: d.logoPosition ?? 'center', maxHeight: logoHeightOf(d), maxWidth: 170, dx: d.logoOffsetX ?? 0, dy: d.logoOffsetY ?? 0, plate: false });

    // The QR code, where the design marked it (<rect id="qr">) or bottom right. On a white plate so it always scans,
    // with the ID and verify address on the same plate so they can always be read.
    const sans = await doc.embedFont(StandardFonts.Helvetica);
    const box = qrBox(svg);
    const vb = viewBoxOf(svg);
    const size = box ? Math.min(120, Math.max(54, (box.size / vb.width) * W)) : 74;
    const x = box ? ((box.x - vb.x) / vb.width) * W : W - 90 - size;
    const y = box ? H - ((box.y - vb.y) / vb.height) * H - size : 86;
    const idText = `ID ${d.code}`;
    const verifyText = drawable(sans, `Verify: ${d.verifyUrl.replace(/^https?:\/\//, '')}`);
    const textWidth = Math.max(sans.widthOfTextAtSize(idText, 6.5), sans.widthOfTextAtSize(verifyText, 6));
    const plateWidth = Math.max(size + 10, textWidth + 10);
    const plateX = Math.min(W - plateWidth - 6, Math.max(6, x + size / 2 - plateWidth / 2));
    const plateY = Math.max(6, y - 24);
    page.drawRectangle({ x: plateX, y: plateY, width: plateWidth, height: y + size + 5 - plateY, color: rgb(1, 1, 1) });
    const qr = await doc.embedPng(await QRCode.toBuffer(d.verifyUrl, { type: 'png', margin: 0, width: 240, errorCorrectionLevel: 'M' }));
    page.drawImage(qr, { x: plateX + (plateWidth - size) / 2, y, width: size, height: size });
    const grey = rgb(0.3, 0.3, 0.33);
    page.drawText(idText, { x: plateX + (plateWidth - sans.widthOfTextAtSize(idText, 6.5)) / 2, y: plateY + 12, size: 6.5, font: sans, color: grey });
    page.drawText(verifyText, { x: plateX + (plateWidth - sans.widthOfTextAtSize(verifyText, 6)) / 2, y: plateY + 4, size: 6, font: sans, color: grey });
    return true;
  } catch (e) {
    console.error('[certificate custom design]', e instanceof Error ? e.message : e);
    return false;
  }
}

const W = 842;
const H = 595;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export { isOwnMediaUrl };

/**
 * An image from our own media host as PNG bytes (any upload format becomes PNG). `maxPx` caps the longest side;
 * `cover` crops it to that exact width × height (for backgrounds). Null when it isn't ours or can't be loaded.
 */
export async function loadImagePng(url: string | null, maxPx = 600, cover?: { width: number; height: number }): Promise<Buffer | null> {
  if (!isOwnMediaUrl(url)) return null;
  // Backgrounds are full-page artwork (uploads allow 5 MB); logos and signatures stay small.
  const limit = cover ? 6 * 1024 * 1024 : MAX_IMAGE_BYTES;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > limit) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > limit) return null;
    // Any format we accept for uploads (WebP, etc.) becomes a PNG pdf-lib can embed.
    const sharp = (await import('sharp')).default;
    return cover
      ? await sharp(buf, { limitInputPixels: 40_000_000 }).resize({ width: cover.width, height: cover.height, fit: 'cover' }).png().timeout({ seconds: 10 }).toBuffer()
      : await sharp(buf).resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch {
    return null;
  }
}

/** loadImagePng, embedded in `doc`. */
export async function loadImage(doc: PDFDocument, url: string | null, maxPx = 600, cover?: { width: number; height: number }): Promise<PDFImage | null> {
  const png = await loadImagePng(url, maxPx, cover);
  try { return png ? await doc.embedPng(png) : null; } catch { return null; }
}

export { drawable };

/** Largest size (down to min) at which text fits the width. */
function fit(font: PDFFont, text: string, size: number, maxWidth: number, min = 10): number {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
  return s;
}

function centered(page: PDFPage, font: PDFFont, text: string, y: number, size: number, color: RGB) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (W - w) / 2, y, size, font, color });
}

/** Split into at most two lines that fit. */
function twoLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];
  const words = text.split(' ');
  let first = '';
  for (const w of words) {
    const next = first ? `${first} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth) break;
    first = next;
  }
  const rest = text.slice(first.length).trim();
  return first ? [first, rest] : [text];
}

type Theme = { bg: RGB; ink: RGB; muted: RGB; accent: RGB; serif: boolean; dark?: boolean; accent2?: RGB };
const paint = (c: Triple) => rgb(c[0], c[1], c[2]);
// The designs' colours live in certificate-themes.ts, shared with the live preview in the host's form.
const THEMES = Object.fromEntries(
  Object.entries(CERTIFICATE_THEMES).map(([name, t]) => [name, { bg: paint(t.bg), ink: paint(t.ink), muted: paint(t.muted), accent: paint(t.accent), serif: t.serif, dark: t.dark, accent2: t.accent2 ? paint(t.accent2) : undefined }]),
) as Record<CertificateTemplate, Theme>;

const TECH_BAND = CERTIFICATE_PAGE.techBand;

/** A round seal with a scalloped edge and a star; `ribbon` adds two tails underneath. */
function drawSeal(page: PDFPage, cx: number, cy: number, fill: RGB, mark: RGB, ribbon: boolean) {
  if (ribbon) {
    // Drawn first so the seal sits on top. SVG paths run with y downwards from the given origin.
    page.drawSvgPath('M -15 0 L -3 0 L -8 46 L -15 37 L -23 44 Z', { x: cx, y: cy, color: fill, opacity: 0.88 });
    page.drawSvgPath('M 3 0 L 15 0 L 23 44 L 15 37 L 8 46 Z', { x: cx, y: cy, color: fill, opacity: 0.88 });
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    page.drawCircle({ x: cx + Math.cos(a) * 26, y: cy + Math.sin(a) * 26, size: 3.6, color: fill });
  }
  page.drawCircle({ x: cx, y: cy, size: 26, color: fill });
  page.drawCircle({ x: cx, y: cy, size: 20.5, borderColor: mark, borderWidth: 0.9, opacity: 0, borderOpacity: 0.9 });
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 11.5 : 4.8;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    points.push(`${i === 0 ? 'M' : 'L'} ${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`);
  }
  page.drawSvgPath(`${points.join(' ')} Z`, { x: cx, y: cy, color: mark });
}

/** Two short lines meeting at each corner of an inset frame. */
function drawCornerBrackets(page: PDFPage, inset: number, length: number, color: RGB, thickness: number) {
  for (const [x, y, dx, dy] of [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]] as const) {
    page.drawLine({ start: { x, y }, end: { x: x + dx * length, y }, thickness, color });
    page.drawLine({ start: { x, y }, end: { x, y: y + dy * length }, thickness, color });
  }
}

export async function renderCertificatePdf(d: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.title} - ${d.recipientName}`);
  doc.setAuthor(d.hostName);
  doc.setCreator('Udyaibase Events');
  const page = doc.addPage([W, H]);
  if (d.template === 'custom' && (await renderCustomPage(doc, page, d))) return doc.save();
  const t = THEMES[d.template] ?? THEMES.classic;
  const white = rgb(1, 1, 1);

  const [serif, serifItalic, sans, sansBold] = await Promise.all([
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);
  const body = t.serif ? serif : sans;
  const heading = t.serif ? serif : sansBold;
  const nameFont = t.serif ? serifItalic : sansBold;

  const [logo, partner, signature] = await Promise.all([loadImage(doc, d.logoUrl), loadImage(doc, d.partnerLogoUrl ?? null), loadImage(doc, d.signatureUrl)]);
  const logos = [logo, partner].filter((i): i is PDFImage => !!i);
  const logoPosition = d.logoPosition ?? 'center';

  const description = drawable(body, d.description ?? '');
  const skills = (d.skills ?? []).map((k) => drawable(sansBold, k)).filter(Boolean);
  // With the extra lines the page is fuller, so the logo and the gaps above the name give a little back.
  const full = !!description || skills.length > 0;
  // On the tech design the logo, host name and title sit in the dark band, in light colours.
  const inBand = d.template === 'tech';

  // Where the logo goes. Centred, it heads the page and the text starts below it. In a corner it is kept smaller,
  // because the title runs across the page beside it.
  const centred = logos.length > 0 && logoPosition === 'center';
  const place: LogoPlace = centred
    ? { position: 'center', maxHeight: Math.max(24, logoHeightOf(d) - (full ? 16 : 0)), maxWidth: 170, dx: d.logoOffsetX ?? 0, dy: d.logoOffsetY ?? 0, plate: false }
    : { position: logoPosition, maxHeight: Math.min(logoHeightOf(d), 56), maxWidth: 120, dx: d.logoOffsetX ?? 0, dy: d.logoOffsetY ?? 0, plate: false };
  // A dark logo needs a white plate on the navy page and on the Tech band.
  place.plate = (d.logoPlate ?? true) && (!!t.dark || inBand);
  const rowHeight = centred ? logoRowHeight(logos, place) : 0;

  // The Tech band is as tall as what it holds (logo, host name, title), so the title is always inside it. It used
  // to be a fixed height: with a logo the title fell below the band, white on white.
  const headerEnd = H - 78 - (centred ? rowHeight + 6 + (d.showHostName ? 10 : 0) : 20) - 34 - 16; // the rule under the title
  const techBand = Math.max(TECH_BAND, H - (headerEnd - 20));

  // Background and frame
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: t.bg });
  if (d.template === 'classic') {
    page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: t.accent, borderWidth: 2.5 });
    page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: t.accent, borderWidth: 0.8 });
  } else if (d.template === 'modern') {
    page.drawRectangle({ x: 0, y: 0, width: 14, height: H, color: t.accent });
    page.drawRectangle({ x: 14, y: H - 6, width: W - 14, height: 6, color: t.ink });
  } else if (d.template === 'executive') {
    page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: t.accent, borderWidth: 1.6 });
    page.drawRectangle({ x: 27, y: 27, width: W - 54, height: H - 54, borderColor: t.accent, borderWidth: 0.5 });
    drawCornerBrackets(page, 40, 44, t.accent, 2.2);
  } else if (d.template === 'heritage') {
    const gold = t.accent2 ?? t.accent;
    page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: t.accent, borderWidth: 3 });
    page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: gold, borderWidth: 1 });
    page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: t.accent, borderWidth: 0.6 });
    for (const [x, y] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) page.drawRectangle({ x: x - 6, y: y - 6, width: 12, height: 12, color: gold });
  } else if (d.template === 'tech') {
    // Dark header band with a teal line under it, a matching strip along the foot, and a faint grid of dots in
    // the band's corner for texture.
    page.drawRectangle({ x: 0, y: H - techBand, width: W, height: techBand, color: t.ink });
    page.drawRectangle({ x: 0, y: H - techBand - 4, width: W, height: 4, color: t.accent });
    for (let row = 0; row < 5; row++) for (let col = 0; col < 9; col++) page.drawCircle({ x: W - 46 - col * 13, y: H - 26 - row * 13, size: 1.1, color: t.accent, opacity: 0.55 - row * 0.09 });
    page.drawRectangle({ x: 0, y: 0, width: W, height: 9, color: t.ink });
    page.drawRectangle({ x: 0, y: 9, width: W, height: 2.5, color: t.accent });
  } else {
    page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: t.accent, borderWidth: 0.6 });
  }

  let y = H - 78;
  const hostLine = (size: number) => {
    const host = drawable(sansBold, d.hostName).toUpperCase();
    centered(page, sansBold, host, y, fit(sansBold, host, size, 520), inBand ? paint(TECH_BAND_HOST) : t.muted);
  };
  if (centred) {
    drawLogos(page, logos, y + 18, place);
    y -= rowHeight + 6;
    if (d.showHostName) { y += 4; hostLine(10); y -= 14; }
  } else {
    if (logos.length) drawLogos(page, logos, H - 46, place);
    if (!logos.length || d.showHostName) hostLine(13);
    y -= 20;
  }

  // Title
  const title = drawable(heading, d.title.toUpperCase());
  y -= 34;
  centered(page, heading, title, y, fit(heading, title, t.serif ? 30 : 26, 680), inBand ? white : t.ink);
  y -= 16;
  page.drawLine({ start: { x: W / 2 - 60, y }, end: { x: W / 2 + 60, y }, thickness: 1.2, color: t.accent });
  // Whatever the logo's height, the text below starts under the band.
  if (inBand) y = H - techBand - 4;

  y -= full ? 32 : 38;
  centered(page, body, 'This is to certify that', y, 13, t.muted);

  // Name
  const name = drawable(nameFont, d.recipientName) || 'Participant';
  y -= full ? 44 : 50;
  const nameSize = fit(nameFont, name, full ? 36 : 40, 640, 18);
  centered(page, nameFont, name, y, nameSize, t.ink);

  // Event
  y -= full ? 30 : 34;
  centered(page, body, drawable(body, d.phrase || 'participated in'), y, 13, t.muted);
  const eventTitle = drawable(sansBold, d.eventTitle);
  const lines = twoLines(sansBold, eventTitle, 18, 640);
  for (const line of lines.slice(0, 2)) {
    y -= 26;
    centered(page, sansBold, line, y, fit(sansBold, line, 18, 640, 11), t.ink);
  }
  y -= 22;
  const dateLine = drawable(body, d.dateLine);
  centered(page, body, dateLine, y, fit(body, dateLine, 12, 600), t.muted);

  // What the event was and what people took away from it. Kept to the middle of the page, clear of the
  // signature on the left and the QR code on the right.
  if (description) {
    y -= 6;
    for (const line of twoLines(body, description, 11.5, 430).slice(0, 2)) {
      y -= 15;
      centered(page, body, line, y, fit(body, line, 11.5, 430, 8), t.ink);
    }
  }
  if (skills.length) {
    y -= 21;
    centered(page, sansBold, 'T O P I C S   C O V E R E D', y, 6.5, t.accent2 ?? t.accent);
    for (const line of twoLines(sansBold, skills.join('   ·   '), 10, 400).slice(0, 2)) {
      y -= 15;
      centered(page, sansBold, line, y, fit(sansBold, line, 10, 400, 7.5), t.ink);
    }
  }

  // Seal (bottom centre) on the two formal designs.
  if (d.template === 'executive') drawSeal(page, W / 2, 96, t.accent, t.bg, false);
  if (d.template === 'heritage') drawSeal(page, W / 2, 104, t.accent, t.accent2 ?? white, true);

  // Signature (bottom left)
  const sigX = 90;
  const lineY = 112;
  if (signature) {
    const s = signature.scaleToFit(170, 52);
    // A signature is dark ink: on the navy page it gets a light plate so it can be seen.
    if (t.dark) page.drawRectangle({ x: sigX + 4, y: lineY + 2, width: 182, height: 56, color: t.ink, opacity: 0.96 });
    page.drawImage(signature, { x: sigX + (190 - s.width) / 2, y: lineY + 4, width: s.width, height: s.height });
  }
  page.drawLine({ start: { x: sigX, y: lineY }, end: { x: sigX + 190, y: lineY }, thickness: 0.8, color: t.muted });
  const signer = drawable(sansBold, d.signerName || d.hostName);
  page.drawText(signer, { x: sigX, y: lineY - 16, size: fit(sansBold, signer, 11, 190, 8), font: sansBold, color: t.ink });
  const signerTitle = drawable(sans, d.signerTitle || 'Organizer');
  page.drawText(signerTitle, { x: sigX, y: lineY - 30, size: fit(sans, signerTitle, 9, 190, 7), font: sans, color: t.muted });

  // QR + code (bottom right)
  const qrPng = await QRCode.toBuffer(d.verifyUrl, { type: 'png', margin: 0, width: 240, errorCorrectionLevel: 'M' });
  const qr = await doc.embedPng(qrPng);
  const qrSize = 74;
  const qrX = W - 90 - qrSize;
  // A QR code needs a white background to scan.
  if (t.dark) page.drawRectangle({ x: qrX - 5, y: lineY - 31, width: qrSize + 10, height: qrSize + 10, color: white });
  page.drawImage(qr, { x: qrX, y: lineY - 26, width: qrSize, height: qrSize });
  const below = t.dark ? 6 : 0;
  const codeText = `ID ${d.code}`;
  page.drawText(codeText, { x: qrX + qrSize - sans.widthOfTextAtSize(codeText, 7.5), y: lineY - 40 - below, size: 7.5, font: sans, color: t.muted });
  const verifyText = drawable(sans, `Verify: ${d.verifyUrl.replace(/^https?:\/\//, '')}`);
  const vs = fit(sans, verifyText, 7.5, 260, 6);
  page.drawText(verifyText, { x: qrX + qrSize - sans.widthOfTextAtSize(verifyText, vs), y: lineY - 51 - below, size: vs, font: sans, color: t.muted });

  if (d.showBranding) centered(page, sans, 'Issued via Udyaibase Events', d.template === 'executive' || d.template === 'heritage' ? 40 : 46, 7.5, t.muted);

  return doc.save();
}
