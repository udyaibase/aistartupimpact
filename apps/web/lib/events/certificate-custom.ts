/**
 * A host's own certificate design, pasted as SVG code (drawn by hand, exported from a design tool, or written by
 * Claude or ChatGPT). This file is the part both the server and the form can use: the markers a design may contain,
 * the checks that explain what is wrong with a pasted design, and filling the markers in. It has no server-only
 * imports. Cleaning the code (certificate-custom-server.ts) and drawing the PDF happen on the server.
 */

/** Largest pasted design, in characters. Embedded pictures count, so a logo should be uploaded rather than pasted. */
export const MAX_CUSTOM_SVG = 300_000;

/** The page: A4 landscape, in points. A design should use viewBox="0 0 842 595". */
export const CUSTOM_PAGE = { width: 842, height: 595 } as const;

/** Markers a design may contain, written {{name}}. Each is replaced when a certificate is made. */
export const CERTIFICATE_MARKERS = {
  name: 'The attendee’s name',
  event: 'The event’s title',
  date: 'The event’s date and place',
  title: 'The certificate title, e.g. “Certificate of Completion”',
  host: 'Your organization’s name',
  phrase: 'The wording, e.g. “successfully completed”',
  description: 'Your sentence about the event',
  topics: 'Topics covered, separated by dots',
  duration: 'Duration, e.g. “6 hours”',
  signer: 'Who signs it',
  signer_title: 'Their title',
  certificate_id: 'The certificate’s ID',
} as const;
export type CertificateMarker = keyof typeof CERTIFICATE_MARKERS;
export type MarkerValues = Record<CertificateMarker, string>;

const MARKER = /\{\{\s*([a-z_]+)\s*\}\}/g;

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Put the values in. Every value is escaped, so a name can never add markup to the design. Unknown markers go. */
export function fillMarkers(svg: string, values: Partial<MarkerValues>): string {
  return svg.replace(MARKER, (_all, key: string) => (key in CERTIFICATE_MARKERS ? xml(String(values[key as CertificateMarker] ?? '')) : ''));
}

export type SvgProblem = { level: 'error' | 'warning'; message: string };

/**
 * What is wrong with a pasted design, in the host's words. Errors stop it being saved; warnings say what will be
 * removed or what may look off. This reads the text only: the server still cleans the code whatever this says.
 */
export function checkCustomSvg(input: string): SvgProblem[] {
  const svg = input.trim();
  const out: SvgProblem[] = [];
  const error = (message: string) => out.push({ level: 'error', message });
  const warn = (message: string) => out.push({ level: 'warning', message });

  if (!svg) { error('Paste your design’s SVG code.'); return out; }
  if (svg.length > MAX_CUSTOM_SVG) error(`The design is too large (${Math.round(svg.length / 1000)} KB; the limit is ${MAX_CUSTOM_SVG / 1000} KB). Pictures pasted into the code are usually the reason: upload your logo instead.`);
  if (!/<svg[\s>]/i.test(svg)) { error('This isn’t SVG code. It must start with <svg … > and end with </svg>. Ask your AI tool for “an SVG”, not HTML.'); return out; }
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) error('Remove the <!DOCTYPE …> line at the top and paste again.');
  if (!/\{\{\s*name\s*\}\}/.test(svg)) error('Add {{name}} where the attendee’s name goes. Without it every certificate would look the same.');

  const viewBox = /<svg[^>]*\sviewBox\s*=\s*["']\s*([\d.\-]+)[\s,]+([\d.\-]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(svg);
  if (!viewBox) error('The <svg> tag needs viewBox="0 0 842 595" (A4 landscape) so the design fills the page.');
  else {
    const ratio = Number(viewBox[3]) / Number(viewBox[4]);
    if (!Number.isFinite(ratio) || Math.abs(ratio - CUSTOM_PAGE.width / CUSTOM_PAGE.height) > 0.03) {
      warn('The design isn’t A4 landscape, so it will be stretched to fit. Use viewBox="0 0 842 595".');
    }
  }

  if (/<script[\s>]/i.test(svg) || /\son[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg)) warn('Scripts are removed. A certificate is a still image.');
  if (/<foreignObject[\s>]/i.test(svg)) warn('HTML inside the SVG (<foreignObject>) is removed. Use <text> for words.');
  if (/<(animate|animateTransform|animateMotion|set)[\s>]/i.test(svg)) warn('Animations are removed.');
  if (/(href|src)\s*=\s*["']\s*(https?:)?\/\//i.test(svg) || /url\(\s*["']?\s*(https?:)?\/\//i.test(svg) || /@import/i.test(svg)) {
    warn('Links to pictures, fonts or styles on other websites are removed. Upload your logo here instead, and use common fonts (serif, sans-serif).');
  }
  const unknown = [...new Set([...svg.matchAll(MARKER)].map((m) => m[1]).filter((k) => !(k in CERTIFICATE_MARKERS)))];
  if (unknown.length) warn(`Unknown marker${unknown.length > 1 ? 's' : ''} ${unknown.map((k) => `{{${k}}}`).join(', ')}: left blank. Use only the markers listed below.`);
  if (!/id\s*=\s*["']qr["']/.test(svg)) warn('No place marked for the QR code, so it goes in the bottom-right corner. To choose the spot, add <rect id="qr" x="…" y="…" width="80" height="80"/>.');
  return out;
}

/** Where the design wants the QR code: the box of its <rect id="qr">, in the design's own units. Null when absent. */
export function qrBox(svg: string): { x: number; y: number; size: number } | null {
  const tag = /<rect\b[^>]*\bid\s*=\s*["']qr["'][^>]*>/i.exec(svg)?.[0];
  if (!tag) return null;
  const num = (name: string) => Number(new RegExp(`\\b${name}\\s*=\\s*["']\\s*([\\d.\\-]+)`, 'i').exec(tag)?.[1]);
  const x = num('x'), y = num('y'), w = num('width'), h = num('height');
  const size = Math.min(w, h);
  if (![x, y, size].every(Number.isFinite) || size < 30) return null;
  return { x, y, size };
}

/** The design's viewBox, for placing the QR code. Falls back to the page. */
export function viewBoxOf(svg: string): { x: number; y: number; width: number; height: number } {
  const m = /<svg[^>]*\sviewBox\s*=\s*["']\s*([\d.\-]+)[\s,]+([\d.\-]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(svg);
  const v = m ? { x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) } : null;
  return v && v.width > 0 && v.height > 0 ? v : { x: 0, y: 0, ...CUSTOM_PAGE };
}

/** What a host can paste into Claude or ChatGPT to get a design that fits first time. */
export function certificatePrompt(eventTitle: string): string {
  return [
    `Design a professional certificate for my event “${eventTitle}” as a single SVG file.`,
    '',
    'Rules it must follow:',
    '- Start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 842 595"> (A4 landscape). No width or height attributes.',
    '- Use only shapes, paths, gradients and <text>. No <script>, no <foreignObject>, no animations, no <image>, no links to other websites or web fonts.',
    '- Fonts: only font-family="Georgia, serif" or font-family="Helvetica, Arial, sans-serif".',
    '- Put these markers in <text> elements exactly as written; they are filled in for each attendee:',
    '  {{title}} (e.g. Certificate of Completion), {{name}} (the attendee, the largest text), {{phrase}} (e.g. successfully completed), {{event}}, {{date}}, {{description}}, {{topics}}, {{host}}, {{signer}}, {{signer_title}}.',
    '- Centre long text with text-anchor="middle" and leave room: names and event titles can be long.',
    '- Add <rect id="qr" x="700" y="440" width="80" height="80" fill="none"/> where a QR code should go, and keep the area under it clear for an ID line.',
    '- Leave a clear area about 150 wide and 60 tall at the top for my logo.',
    '',
    'Reply with only the SVG code.',
  ].join('\n');
}

/** Example values for the live preview. */
export function sampleMarkerValues(over: Partial<MarkerValues>): MarkerValues {
  return {
    name: 'Priya Sharma', event: 'Your event', date: '', title: 'Certificate of Participation', host: '', phrase: 'participated in', description: '', topics: '',
    duration: '', signer: '', signer_title: '', certificate_id: 'SAMPLE0000000000', ...over,
  };
}
