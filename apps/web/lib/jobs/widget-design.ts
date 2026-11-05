/**
 * The options that let a careers widget match a company's website. Client-safe. Everything is validated down to
 * hex colours, plain font names and numbers, so no saved value can inject CSS or load anything but Google Fonts.
 */
export interface WidgetDesign {
  colors?: { background?: string; card?: string; text?: string; muted?: string; border?: string };
  /** Any Google Font, by name. Overrides the font picker. */
  font?: string;
  headingFont?: string;
  /** Exact corner radius in px. Overrides the Square / Rounded / Pill choice. */
  radius?: number;
  showSearch?: boolean;
  showLocationFilter?: boolean;
  showTeamFilter?: boolean;
  /** Keeps the widget from stretching across very wide pages. */
  maxWidth?: number;
  emptyText?: string;
  /** On the employer's real site, use the colours, font and corners read from that page (public/embed/loader.js). */
  matchSite?: boolean;
}

/** What the loader read from the host page. Arrives in the iframe's address, so it's validated like anything else. */
export interface SiteHint {
  accent?: string;
  card?: string;
  text?: string;
  font?: string;
  headingFont?: string;
  radius?: number;
}

const COLOR_KEYS = ['background', 'card', 'text', 'muted', 'border'] as const;
export type DesignColorKey = (typeof COLOR_KEYS)[number];

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const isFontName = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9 -]{1,48}$/.test(v.trim());

export function parseWidgetDesign(raw: unknown): WidgetDesign {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d: WidgetDesign = {};
  const colors: NonNullable<WidgetDesign['colors']> = {};
  for (const k of COLOR_KEYS) if (isHex(r.colors?.[k])) colors[k] = r.colors[k].toLowerCase();
  if (Object.keys(colors).length) d.colors = colors;
  if (isFontName(r.font)) d.font = r.font.trim();
  if (isFontName(r.headingFont)) d.headingFont = r.headingFont.trim();
  const radius = Number(r.radius);
  if (r.radius !== null && r.radius !== undefined && r.radius !== '' && Number.isFinite(radius)) d.radius = Math.max(0, Math.min(32, Math.round(radius)));
  for (const k of ['showSearch', 'showLocationFilter', 'showTeamFilter', 'matchSite'] as const) if (typeof r[k] === 'boolean') d[k] = r[k];
  const maxWidth = Number(r.maxWidth);
  if (Number.isFinite(maxWidth) && maxWidth >= 480 && maxWidth <= 1600) d.maxWidth = Math.round(maxWidth);
  if (typeof r.emptyText === 'string' && r.emptyText.trim()) d.emptyText = r.emptyText.trim().slice(0, 160);
  return d;
}

export function parseSiteHint(raw: string | null): SiteHint {
  if (!raw) return {};
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!r || typeof r !== 'object') return {};
  const h: SiteHint = {};
  if (isHex(r.accent)) h.accent = r.accent.toLowerCase();
  if (isHex(r.background)) h.card = r.background.toLowerCase();
  if (isHex(r.text)) h.text = r.text.toLowerCase();
  if (isFontName(r.font) && !isSystemFont(r.font)) h.font = r.font.trim();
  if (isFontName(r.headingFont) && !isSystemFont(r.headingFont)) h.headingFont = r.headingFont.trim();
  const radius = Number(r.radius);
  if (r.radius !== undefined && Number.isFinite(radius) && radius >= 0) h.radius = Math.min(32, Math.round(radius));
  // Text that can't be read on that background is worse than the widget's own colours.
  if (h.card && h.text && contrastRatio(h.card, h.text) < 4.5) { delete h.card; delete h.text; }
  return h;
}

const isSystemFont = (name: string) => /^(system-ui|ui-sans-serif|ui-serif|sans-serif|serif|inherit|-apple-system|blinkmacsystemfont|segoe ui|arial|helvetica|helvetica neue|times new roman|times|georgia)$/i.test(name.trim());

/** Requests the usual weights; a font without them falls back to the plain request (see JobsWidgetView). */
export const googleFontHref = (name: string, weights = true) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}${weights ? ':wght@400;500;600;700' : ''}&display=swap`;

export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** One-click starting points. Colours stay the company's accent; these set shape and feel. */
export const DESIGN_PRESETS = [
  { id: 'clean', name: 'Clean', hint: 'Thin outlines, roomy', patch: { cardStyle: 'bordered', buttonStyle: 'filled', spacing: 'comfortable', layout: 'list', design: { radius: 10 } } },
  { id: 'minimal', name: 'Minimal', hint: 'Flat rows, no boxes', patch: { cardStyle: 'flat', buttonStyle: 'outline', spacing: 'compact', layout: 'compact', design: { radius: 0 } } },
  { id: 'soft', name: 'Soft', hint: 'Shadows, round corners', patch: { cardStyle: 'elevated', buttonStyle: 'soft', spacing: 'spacious', layout: 'grid', design: { radius: 20 } } },
  { id: 'bold', name: 'Bold', hint: 'Square, strong buttons', patch: { cardStyle: 'bordered', buttonStyle: 'filled', spacing: 'comfortable', layout: 'grid', buttonSize: 'lg', design: { radius: 2 } } },
] as const;
