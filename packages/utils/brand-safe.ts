/**
 * Brand settings (colours, font names, font file links) are written into a <style> tag on every page of the site.
 * Only values in these simple shapes are allowed, on save in admin and again when the site reads them, so a stored
 * value can never close the style tag or add script.
 */

/** #RGB, #RRGGBB or #RRGGBBAA. */
export function safeBrandColor(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v.trim()) ? v.trim() : fallback;
}

/** A font family name: letters, numbers, spaces and - _ . only. */
export function safeFontName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9 _.-]{1,60}$/.test(s) ? s : null;
}

/** An https link to a font file, with no characters that could end a CSS url('…'). */
export function safeFontUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^https:\/\/[^\s'"()<>\;{}]+$/.test(s) && s.length <= 500 ? s : null;
}
