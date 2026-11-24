import sanitizeHtml from 'sanitize-html';
import { sanitizeCustomSvg } from './certificate-custom-server';
import { qrBox, viewBoxOf } from './certificate-custom';

/**
 * A host's own badge design, made ready to print (server only).
 *
 * Badges print by the hundred, so the design is turned into an image once per print run, not once per person:
 * - the design is cleaned (the same allow-list as certificate designs: no scripts, links or outside files);
 * - every <text> holding a person's placeholder ({{name}}, {{company}} …) is taken out of the artwork and kept as a
 *   "slot" (position, size, alignment, colour, weight), so each person's details are printed there as real text;
 * - the event-wide placeholders ({{event}}, {{date}}) are filled in the artwork itself.
 * Parsing uses a real XML parser (sanitize-html), not regular expressions on tags.
 */

export interface BadgeSlot {
  /** The text with its placeholders, e.g. "{{role}} at {{company}}". */
  template: string;
  x: number;
  y: number;
  size: number;
  anchor: 'start' | 'middle' | 'end';
  bold: boolean;
  /** 0–1 RGB. */
  color: [number, number, number];
}

export interface PreparedBadgeDesign {
  /** The artwork, without the person slots, with the event-wide placeholders filled. */
  background: string;
  slots: BadgeSlot[];
  qr: { x: number; y: number; size: number } | null;
  viewBox: { x: number; y: number; width: number; height: number };
}

const PERSON = /\{\{\s*(name|company|role|ticket|answer1|answer2)\s*\}\}/;
const ANY_MARKER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A design cleaned for storing and drawing; empty when it can't be used. A design that names no font gets the same
 * sans-serif the printed names use, so the preview, the artwork and the per-person text all match.
 */
export function cleanBadgeSvg(input: unknown): string {
  const svg = sanitizeCustomSvg(input);
  if (!svg) return '';
  const end = svg.indexOf('>');
  const root = svg.slice(0, end);
  return root.includes('font-family') ? svg : `${root} font-family="Helvetica, Arial, sans-serif"${svg.slice(end)}`;
}

function styleValue(style: string | undefined, prop: string): string | undefined {
  if (!style) return undefined;
  for (const part of style.split(';')) {
    const [k, v] = part.split(':');
    if (k?.trim().toLowerCase() === prop && v) return v.trim();
  }
  return undefined;
}

function parseColor(v: string | undefined): [number, number, number] {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'white' || s === '#fff' || s === '#ffffff') return [1, 1, 1];
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  return [0.07, 0.09, 0.15];
}

function slotFrom(attribs: Record<string, string>, text: string): BadgeSlot | null {
  const style = attribs.style;
  const num = (v: string | undefined) => Number.parseFloat(String(v ?? '').replace(/px$/, ''));
  const x = num(attribs.x);
  const y = num(attribs.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const sizeRaw = num(attribs['font-size'] ?? styleValue(style, 'font-size'));
  const anchorRaw = (attribs['text-anchor'] ?? styleValue(style, 'text-anchor') ?? 'start').trim();
  const weight = (attribs['font-weight'] ?? styleValue(style, 'font-weight') ?? '').trim();
  return {
    template: text,
    x,
    y,
    size: Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.min(sizeRaw, 200) : 16,
    anchor: anchorRaw === 'middle' || anchorRaw === 'end' ? anchorRaw : 'start',
    bold: weight === 'bold' || weight === 'bolder' || Number(weight) >= 600,
    color: parseColor(attribs.fill ?? styleValue(style, 'fill')),
  };
}

/** Fill placeholders with escaped values (a name can never add markup). Unknown placeholders are removed. */
export function fillBadgeMarkers(svg: string, values: Record<string, string>): string {
  return svg.replace(ANY_MARKER, (_all, key: string) => xml(values[key] ?? ''));
}

export function prepareBadgeDesign(input: unknown, shared: { event: string; date: string }): PreparedBadgeDesign | null {
  const svg = cleanBadgeSvg(input);
  if (!svg) return null;
  const slots: BadgeSlot[] = [];
  const withoutSlots = sanitizeHtml(svg, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
    exclusiveFilter: (frame) => {
      if (frame.tag !== 'text') return false;
      const text = (frame.text || '').replace(/\s+/g, ' ').trim();
      if (!PERSON.test(text)) return false;
      const slot = slotFrom(frame.attribs, text);
      if (slot) slots.push(slot);
      return true; // printed per person instead
    },
  });
  return {
    background: fillBadgeMarkers(withoutSlots, { event: shared.event, date: shared.date }),
    slots,
    qr: qrBox(svg),
    viewBox: viewBoxOf(svg),
  };
}
