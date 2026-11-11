/**
 * Canonical compare URL segment: the tool slugs, de-duplicated and in alphabetical order, joined by "-vs-".
 * Returns null when the segment isn't a 2–3 tool comparison (the page itself 404s those).
 * Edge-safe: no imports, so middleware can use it.
 */
export function canonicalCompareSlug(raw: string): string | null {
  if (!raw || raw.includes('/')) return null;
  const parts = [...new Set(raw.split('-vs-').filter(Boolean))];
  if (parts.length < 2 || parts.length > 3) return null;
  return parts.sort().join('-vs-');
}

/** Compare URL for a set of tool slugs, always in canonical order. */
export function compareHref(slugs: string[]): string {
  return `/tools/compare/${[...new Set(slugs)].sort().join('-vs-')}`;
}
