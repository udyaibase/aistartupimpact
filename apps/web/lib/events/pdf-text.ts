import type { PDFFont } from 'pdf-lib';

/** Shared by certificates and badges (server PDFs and the in-browser badge preview): no server imports here. */

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
