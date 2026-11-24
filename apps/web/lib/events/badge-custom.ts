/**
 * A host's own badge design (Pro): SVG made in Canva, Figma or Illustrator, or written by an AI tool, with
 * placeholders where each person's details go and a box for the check-in QR code. This file is the part the page
 * and the server share: the placeholders, the sizes, the checks that explain what's wrong with a design, and a prompt
 * for AI tools. Cleaning the code and drawing it happen on the server (badge-custom-server.ts).
 */

import { MAX_BADGE_SVG } from './badge-settings';

/** Placeholders a design may contain, written {{name}}. */
export const BADGE_MARKERS = {
  name: 'The person’s name (required)',
  company: 'Their company',
  role: 'Their role or job title',
  ticket: 'Their ticket type',
  answer1: 'Answer to the first chosen registration question',
  answer2: 'Answer to the second chosen registration question',
  event: 'The event name',
  date: 'The event date',
} as const;
export type BadgeMarker = keyof typeof BADGE_MARKERS;

/** Different for each person: printed as text on top of the design. The others are the same on every badge. */
export const PERSON_MARKERS: BadgeMarker[] = ['name', 'company', 'role', 'ticket', 'answer1', 'answer2'];

/** The size a design should be drawn at, in points (1/72 inch), per print size. */
export const BADGE_DESIGN_SIZES = {
  a6: { width: 298, height: 420, label: 'A6 card (portrait)' },
  label: { width: 288, height: 216, label: '4 × 3 inch label (landscape)' },
  a4: { width: 298, height: 210, label: 'A4 sheet, one of 8 badges (landscape)' },
  card: { width: 243, height: 153, label: 'Credit card size (landscape)' },
} as const;

export type BadgeSvgProblem = { level: 'error' | 'warning'; message: string };

/**
 * What's wrong with a design, in the host's words. Errors stop it being saved; warnings say what may look off. This
 * reads the text only: the server still cleans the code whatever this says.
 */
export function checkBadgeSvg(input: string): BadgeSvgProblem[] {
  const svg = input.trim();
  const out: BadgeSvgProblem[] = [];
  const error = (message: string) => out.push({ level: 'error', message });
  const warn = (message: string) => out.push({ level: 'warning', message });

  if (!svg) { error('Upload or paste your design’s SVG code.'); return out; }
  if (svg.length > MAX_BADGE_SVG) error(`The design is too large (${Math.round(svg.length / 1000)} KB; the limit is ${MAX_BADGE_SVG / 1000} KB). Pictures inside the file are usually the reason: use smaller or fewer images.`);
  if (!/<svg[\s>]/i.test(svg)) { error('This isn’t SVG. Export your design as SVG (not PNG or PDF), or ask your AI tool for “an SVG”.'); return out; }
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) error('Remove the <!DOCTYPE …> line at the top and try again.');
  if (!/\{\{\s*name\s*\}\}/.test(svg)) error('Add {{name}} as text where the person’s name goes. Without it every badge would look the same.');
  if (!/<svg[^>]*\sviewBox\s*=/i.test(svg)) error('The <svg> tag needs a viewBox, for example viewBox="0 0 298 420" for an A6 card.');
  if (!/<rect\b[^>]*\bid\s*=\s*["']qr["']/i.test(svg)) warn('No QR box found. Add <rect id="qr" …/> where the check-in QR code goes; otherwise it is printed at the bottom.');
  if (/<g\b[^>]*\btransform\s*=[^>]*>[\s\S]*\{\{\s*(name|company|role|ticket|answer1|answer2)\s*\}\}/i.test(svg)) {
    warn('A placeholder is inside a moved or scaled group (transform). Its text may print in the wrong place: give that <text> its own x and y instead.');
  }
  return out;
}

/** What a host can paste into Claude or ChatGPT to get a design that fits first time. */
export function badgePrompt(eventTitle: string, size: keyof typeof BADGE_DESIGN_SIZES): string {
  const d = BADGE_DESIGN_SIZES[size];
  return [
    `Design a conference name badge as a single SVG for "${eventTitle}".`,
    `Use viewBox="0 0 ${d.width} ${d.height}" (${d.label}). Return only the SVG code.`,
    'Put these placeholders as plain <text> elements, each with its own x, y, font-size and text-anchor, and not inside a <g transform>:',
    '{{name}} (large, bold), {{role}}, {{company}}, {{ticket}}. You may also use {{event}} and {{date}}.',
    `Add an empty square <rect id="qr" x=".." y=".." width="90" height="90" fill="#ffffff"/> where the check-in QR code goes.`,
    'Leave room for long names (up to about 24 characters). No external images, fonts, links or scripts.',
  ].join('\n');
}
