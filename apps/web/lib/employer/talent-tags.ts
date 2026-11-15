/** Team tags on talent pool candidates. Client-safe. */
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 30;

/** Trimmed, lower-case, de-duplicated tags; null when the input isn't a list of strings. */
export function cleanTags(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.some((t) => typeof t !== 'string')) return null;
  const out: string[] = [];
  for (const raw of input as string[]) {
    const t = raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
