/**
 * Badge design for an event (Event.badgeSettings), shared by the Badges page and the PDF.
 *
 * Every host picks a template, an accent colour, whether their logo is shown and where the QR code sits. Pro hosts
 * can also colour each
 * ticket type, choose which details are printed (including up to two registration answers), add a sponsor strip,
 * print on their own background artwork, or upload a whole design of their own (the "custom" template, SVG).
 *
 * `cleanBadgeSettings` is the only way in: whatever was saved or sent, it returns settings with known values, and
 * for Free hosts the Pro options are back at their defaults. `proOptionsUsed` names the Pro options a request asked
 * for, so the server can refuse them for Free hosts instead of silently dropping them.
 */

export const BADGE_TEMPLATES = ['classic', 'bold', 'minimal', 'dark', 'conference', 'custom'] as const;
/** The built-in designs (every host). "custom" is the host's own uploaded design (Pro). */
export const BUILT_IN_TEMPLATES = ['classic', 'bold', 'minimal', 'dark', 'conference'] as const;
export type BadgeTemplate = (typeof BADGE_TEMPLATES)[number];

export const BADGE_TEMPLATE_INFO: Record<BadgeTemplate, { label: string; hint: string }> = {
  classic: { label: 'Classic', hint: 'Clean and printer-friendly. Works on any printer.' },
  bold: { label: 'Bold', hint: 'A coloured band with the event name, and a big name below.' },
  minimal: { label: 'Minimal', hint: 'Lots of white space and a thin accent line.' },
  dark: { label: 'Dark', hint: 'Light text on a dark badge, for premium events.' },
  conference: { label: 'Conference', hint: 'A coloured strip with the ticket type, easy to spot at the door.' },
  custom: { label: 'Your own design', hint: 'Upload a design made in Canva, Figma or with AI, with {{name}} and a QR box.' },
};

export type BadgeTextPosition = 'top' | 'center' | 'bottom';
export type BadgeTextColor = 'dark' | 'light';
/** Where the QR code sits. "auto": centred on tall badges, right on wide ones. */
export type BadgeQrPosition = 'auto' | 'left' | 'center' | 'right';
export const QR_POSITIONS: BadgeQrPosition[] = ['auto', 'left', 'center', 'right'];
/** Largest uploaded design, in characters (pictures inside it count). */
export const MAX_BADGE_SVG = 300_000;

export interface BadgeFields {
  company: boolean;
  role: boolean;
  tier: boolean;
  qr: boolean;
}

export interface BadgeSettings {
  template: BadgeTemplate;
  /** #RRGGBB */
  accent: string;
  showLogo: boolean;
  qrPosition: BadgeQrPosition;
  // ── Pro ──
  /** Ticket type id → #RRGGBB. */
  tierColors: Record<string, string>;
  fields: BadgeFields;
  /** Registration questions whose answers are printed (at most two). */
  questionIds: string[];
  sponsorStrip: boolean;
  /** The host's own artwork behind the text (an upload on our media host). */
  backgroundUrl: string | null;
  textPosition: BadgeTextPosition;
  textColor: BadgeTextColor;
  /** The host's own design (SVG, cleaned on save), used when template is "custom". */
  customSvg: string | null;
}

export const DEFAULT_ACCENT = '#FF3131';
export const MAX_BADGE_QUESTIONS = 2;

const DEFAULT_FIELDS: BadgeFields = { company: true, role: true, tier: true, qr: true };

export const DEFAULT_BADGE_SETTINGS: BadgeSettings = {
  template: 'classic',
  accent: DEFAULT_ACCENT,
  showLogo: true,
  qrPosition: 'auto',
  tierColors: {},
  fields: DEFAULT_FIELDS,
  questionIds: [],
  sponsorStrip: false,
  backgroundUrl: null,
  textPosition: 'top',
  textColor: 'dark',
  customSvg: null,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Safe settings from anything saved or sent. `isOwnMedia` decides which background links are allowed (passed in so
 * this file stays free of server code). Free hosts (`pro: false`) always get the Pro options at their defaults.
 */
export function cleanBadgeSettings(raw: unknown, opts: { pro: boolean; isOwnMedia: (url: string) => boolean }): BadgeSettings {
  const r = obj(raw);
  const base: BadgeSettings = {
    ...DEFAULT_BADGE_SETTINGS,
    template: (BUILT_IN_TEMPLATES as readonly string[]).includes(r.template as string) ? (r.template as BadgeTemplate) : 'classic',
    accent: isHexColor(r.accent) ? r.accent.toUpperCase() : DEFAULT_ACCENT,
    showLogo: r.showLogo !== false,
    qrPosition: (QR_POSITIONS as string[]).includes(r.qrPosition as string) ? (r.qrPosition as BadgeQrPosition) : 'auto',
  };
  if (!opts.pro) return base;
  const customSvg = typeof r.customSvg === 'string' && r.customSvg.trim() && r.customSvg.length <= MAX_BADGE_SVG ? r.customSvg : null;

  const f = obj(r.fields);
  const tierColors: Record<string, string> = {};
  for (const [id, color] of Object.entries(obj(r.tierColors)).slice(0, 30)) {
    if (ID.test(id) && isHexColor(color)) tierColors[id] = color.toUpperCase();
  }
  const questionIds = Array.isArray(r.questionIds)
    ? [...new Set(r.questionIds.filter((q): q is string => typeof q === 'string' && ID.test(q)))].slice(0, MAX_BADGE_QUESTIONS)
    : [];
  const bg = typeof r.backgroundUrl === 'string' && r.backgroundUrl.length <= 500 && opts.isOwnMedia(r.backgroundUrl) ? r.backgroundUrl : null;
  return {
    ...base,
    // The own-design template needs a design.
    template: r.template === 'custom' && customSvg ? 'custom' : base.template,
    customSvg,
    tierColors,
    fields: {
      company: f.company !== false,
      role: f.role !== false,
      tier: f.tier !== false,
      qr: f.qr !== false,
    },
    questionIds,
    sponsorStrip: r.sponsorStrip === true,
    backgroundUrl: bg,
    textPosition: r.textPosition === 'center' || r.textPosition === 'bottom' ? r.textPosition : 'top',
    textColor: r.textColor === 'light' ? 'light' : 'dark',
  };
}

/** The Pro options a request asks for (empty when it only uses what every host has). */
export function proOptionsUsed(raw: unknown): string[] {
  const r = obj(raw);
  const f = obj(r.fields);
  const used: string[] = [];
  if (Object.keys(obj(r.tierColors)).length) used.push('ticket type colours');
  if (Object.values(f).some((v) => v === false)) used.push('choosing what is printed');
  if (Array.isArray(r.questionIds) && r.questionIds.length) used.push('registration answers');
  if (r.sponsorStrip === true) used.push('sponsor strip');
  if (typeof r.backgroundUrl === 'string' && r.backgroundUrl) used.push('your own background');
  if (r.textPosition === 'center' || r.textPosition === 'bottom') used.push('text position');
  if (r.textColor === 'light') used.push('text colour');
  if (r.template === 'custom' || (typeof r.customSvg === 'string' && r.customSvg.trim())) used.push('your own design');
  return used;
}
