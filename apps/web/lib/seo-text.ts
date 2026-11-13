/**
 * Search-snippet helpers shared by page metadata.
 * Google shows about 60 characters of a title and about 155 of a description; past that it cuts mid-word.
 */

/** Text for a meta description: emoji and "Source:" lines removed, cut at a word near `max` with an ellipsis. */
export function metaSnippet(text: string, max = 155): string {
  const clean = String(text || '')
    .split('\n')
    .filter((l) => !/^\s*source:/i.test(l))
    .join(' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[,;:—–-]\s*$/, '')}…`;
}

/** The first candidate title that fits in `max` characters (the layout adds " | Udyaibase" after it). */
export function fitTitle(candidates: string[], max = 62): string {
  const clean = candidates.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return clean.find((c) => c.length <= max) ?? clean[clean.length - 1] ?? '';
}

/**
 * A tagline used mid-sentence ("Acme, building X, raised…"): drops the final full stop and lowercases the first
 * letter only when it starts an ordinary capitalised word ("Building" → "building"), never an acronym or brand
 * ("AI-powered", "B2B", "GenAI", "iOS" stay as written).
 */
export function taglineClause(tagline: string): string {
  const t = tagline.trim().replace(/\.$/, '');
  return /^[A-Z][a-z]+(?:\s|$|,)/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}
