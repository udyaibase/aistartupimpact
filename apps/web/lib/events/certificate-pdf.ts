import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import type { CertificateTemplate } from './after-event';
import { isOwnMediaUrl } from './urls';

/**
 * Certificate PDF (A4 landscape) in one of three templates, with the host's logo and signature and a QR code that
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
}

const W = 842;
const H = 595;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export { isOwnMediaUrl };

async function loadImage(doc: PDFDocument, url: string | null): Promise<PDFImage | null> {
  if (!isOwnMediaUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_IMAGE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return null;
    // Any format we accept for uploads (WebP, etc.) becomes a PNG pdf-lib can embed.
    const sharp = (await import('sharp')).default;
    const png = await sharp(buf).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    return await doc.embedPng(png);
  } catch {
    return null;
  }
}

const SWAPS: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '₹': 'Rs ', ' ': ' ' };

/** Text the font can draw: known swaps, then anything the font can't encode is dropped. */
export function drawable(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const c = SWAPS[ch] ?? ch;
    try { font.encodeText(c); out += c; } catch {
      // Accented Latin letters fall back to the plain letter (é -> e).
      const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      try { if (base) { font.encodeText(base); out += base; } } catch { /* not drawable: skip */ }
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

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

const THEMES: Record<CertificateTemplate, { bg: RGB; ink: RGB; muted: RGB; accent: RGB; serif: boolean }> = {
  classic: { bg: rgb(0.992, 0.98, 0.957), ink: rgb(0.1, 0.12, 0.2), muted: rgb(0.38, 0.38, 0.42), accent: rgb(0.69, 0.55, 0.24), serif: true },
  modern: { bg: rgb(1, 1, 1), ink: rgb(0.07, 0.09, 0.15), muted: rgb(0.42, 0.45, 0.5), accent: rgb(0.86, 0.15, 0.27), serif: false },
  minimal: { bg: rgb(1, 1, 1), ink: rgb(0.1, 0.1, 0.1), muted: rgb(0.45, 0.45, 0.45), accent: rgb(0.75, 0.75, 0.75), serif: false },
};

export async function renderCertificatePdf(d: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.title} - ${d.recipientName}`);
  doc.setAuthor(d.hostName);
  doc.setCreator('Udyaibase Events');
  const page = doc.addPage([W, H]);
  const t = THEMES[d.template];

  const [serif, serifItalic, sans, sansBold] = await Promise.all([
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);
  const body = t.serif ? serif : sans;
  const heading = t.serif ? serif : sansBold;
  const nameFont = t.serif ? serifItalic : sansBold;

  // Background and frame
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: t.bg });
  if (d.template === 'classic') {
    page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: t.accent, borderWidth: 2.5 });
    page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: t.accent, borderWidth: 0.8 });
  } else if (d.template === 'modern') {
    page.drawRectangle({ x: 0, y: 0, width: 14, height: H, color: t.accent });
    page.drawRectangle({ x: 14, y: H - 6, width: W - 14, height: 6, color: t.ink });
  } else {
    page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: t.accent, borderWidth: 0.6 });
  }

  const [logo, signature] = await Promise.all([loadImage(doc, d.logoUrl), loadImage(doc, d.signatureUrl)]);

  let y = H - 78;
  if (logo) {
    const s = logo.scaleToFit(150, 56);
    page.drawImage(logo, { x: (W - s.width) / 2, y: y - s.height + 18, width: s.width, height: s.height });
    y -= s.height + 6;
  } else {
    const host = drawable(sansBold, d.hostName).toUpperCase();
    centered(page, sansBold, host, y, fit(sansBold, host, 13, 520), t.muted);
    y -= 20;
  }

  // Title
  const title = drawable(heading, d.title.toUpperCase());
  y -= 34;
  centered(page, heading, title, y, fit(heading, title, d.template === 'classic' ? 30 : 26, 680), t.ink);
  y -= 16;
  page.drawLine({ start: { x: W / 2 - 60, y }, end: { x: W / 2 + 60, y }, thickness: 1.2, color: t.accent });

  y -= 38;
  centered(page, body, 'This is to certify that', y, 13, t.muted);

  // Name
  const name = drawable(nameFont, d.recipientName) || 'Participant';
  y -= 50;
  const nameSize = fit(nameFont, name, 40, 640, 18);
  centered(page, nameFont, name, y, nameSize, t.ink);

  // Event
  y -= 34;
  centered(page, body, 'participated in', y, 13, t.muted);
  const eventTitle = drawable(sansBold, d.eventTitle);
  const lines = twoLines(sansBold, eventTitle, 18, 640);
  for (const line of lines.slice(0, 2)) {
    y -= 26;
    centered(page, sansBold, line, y, fit(sansBold, line, 18, 640, 11), t.ink);
  }
  y -= 22;
  const dateLine = drawable(body, d.dateLine);
  centered(page, body, dateLine, y, fit(body, dateLine, 12, 600), t.muted);

  // Signature (bottom left)
  const sigX = 90;
  const lineY = 112;
  if (signature) {
    const s = signature.scaleToFit(170, 52);
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
  page.drawImage(qr, { x: qrX, y: lineY - 26, width: qrSize, height: qrSize });
  const codeText = `ID ${d.code}`;
  page.drawText(codeText, { x: qrX + qrSize - sans.widthOfTextAtSize(codeText, 7.5), y: lineY - 40, size: 7.5, font: sans, color: t.muted });
  const verifyText = drawable(sans, `Verify: ${d.verifyUrl.replace(/^https?:\/\//, '')}`);
  const vs = fit(sans, verifyText, 7.5, 260, 6);
  page.drawText(verifyText, { x: qrX + qrSize - sans.widthOfTextAtSize(verifyText, vs), y: lineY - 51, size: vs, font: sans, color: t.muted });

  if (d.showBranding) centered(page, sans, 'Issued via Udyaibase Events', 46, 7.5, t.muted);

  return doc.save();
}
