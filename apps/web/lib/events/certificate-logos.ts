/**
 * Where the certificate logos go, shared by the PDF and the live preview so they always match.
 *
 * The host's logo has its position, size and nudges. The partner logo either sits beside it in one row ("beside",
 * the original behaviour, using the partner's own size) or is placed on its own: left, centre or right, with its own
 * size and nudges. Without a host logo the partner logo takes the host logo's place.
 */

export type LogoSpot = 'center' | 'left' | 'right';
export type PartnerPlacement = 'beside' | LogoSpot;
export const PARTNER_PLACEMENTS: PartnerPlacement[] = ['beside', 'left', 'center', 'right'];

export const LOGO_GAP = 22;
const MIN_H = 24;
const MAX_H = 74;
/** In a corner a logo is kept smaller, because the title runs across the page beside it. */
const CORNER_MAX_H = 56;

export type LogoPlace = { position: LogoSpot; maxWidth: number; heights: number[]; dx: number; dy: number; plate: boolean };
export type LogoPlan = {
  /** The first row: the host logo (and the partner beside it), or the partner alone when there's no host logo. */
  row: { items: ('main' | 'partner')[]; place: LogoPlace } | null;
  /** The partner logo placed on its own. */
  solo: { place: LogoPlace } | null;
  /** The row heads the page (centred): the text starts below it. */
  centred: boolean;
};

export type LogoInput = {
  hasMain: boolean;
  hasPartner: boolean;
  position: LogoSpot;
  partnerPlacement: PartnerPlacement;
  /** Heights in points as chosen by the host (24 to 74). */
  mainHeight: number;
  partnerHeight: number;
  dx: number; dy: number;
  partnerDx: number; partnerDy: number;
  /** The page has a description or topics, so a centred logo gives a little room back. */
  full: boolean;
  plate: boolean;
  /** The host's own SVG design: logos sit at the very top at the chosen size, nothing else moves. */
  custom?: boolean;
};

const clampH = (h: number) => Math.min(MAX_H, Math.max(MIN_H, h));

export function planLogos(o: LogoInput): LogoPlan {
  if (!o.hasMain && !o.hasPartner) return { row: null, solo: null, centred: false };
  const separate = o.hasMain && o.hasPartner && o.partnerPlacement !== 'beside' && o.partnerPlacement !== o.position;
  const rowItems: ('main' | 'partner')[] = o.hasMain ? (o.hasPartner && !separate ? ['main', 'partner'] : ['main']) : ['partner'];
  const centred = !o.custom && o.position === 'center';

  // A height in this spot: full size for a custom design, a little smaller when centred on a full page, capped in a corner.
  const sized = (h: number, spot: LogoSpot, heading: boolean) => {
    const c = clampH(h);
    if (o.custom) return c;
    if (heading && spot === 'center') return Math.max(MIN_H, c - (o.full ? 16 : 0));
    return Math.min(c, CORNER_MAX_H);
  };

  const row: LogoPlace = {
    position: o.position,
    maxWidth: o.custom || centred ? 170 : 120,
    heights: rowItems.map((it) => sized(it === 'main' ? o.mainHeight : o.partnerHeight, o.position, true)),
    dx: o.hasMain ? o.dx : o.partnerDx,
    dy: o.hasMain ? o.dy : o.partnerDy,
    plate: o.plate,
  };
  const spot = o.partnerPlacement === 'beside' ? o.position : o.partnerPlacement;
  const solo: LogoPlace | null = separate
    ? { position: spot, maxWidth: o.custom ? 170 : 120, heights: [sized(o.partnerHeight, spot, false)], dx: o.partnerDx, dy: o.partnerDy, plate: o.plate }
    : null;
  return { row: { items: rowItems, place: row }, solo: solo && { place: solo }, centred };
}

/** Sizes of pictures (width / height ratios) fitted into a place, and the row's total width and height. */
export function fitRow(aspects: number[], place: Pick<LogoPlace, 'maxWidth' | 'heights'>) {
  const sized = aspects.map((a, i) => {
    const maxH = place.heights[i] ?? place.heights[0] ?? MIN_H;
    const k = Math.min(place.maxWidth / a, maxH);
    return { width: a * k, height: k };
  });
  return {
    sized,
    total: sized.reduce((w, x) => w + x.width, 0) + LOGO_GAP * Math.max(0, sized.length - 1),
    height: sized.length ? Math.max(...sized.map((x) => x.height)) : 0,
  };
}

/** Left edge of a row of the given width on a page of width `pageW`. */
export function rowLeft(place: Pick<LogoPlace, 'position' | 'dx'>, total: number, pageW: number): number {
  return (place.position === 'left' ? 72 : place.position === 'right' ? pageW - 72 - total : (pageW - total) / 2) + place.dx;
}
