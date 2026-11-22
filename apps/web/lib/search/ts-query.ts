/**
 * The words of a search as a Postgres prefix query ("ai:* & tools:*"). Only letters (with their accents and vowel signs) and numbers are kept, so the
 * query syntax (! | & ( ) :) can't be typed in, and it is capped at 8 words of 40 characters.
 */
export function toPrefixTsQuery(term: string): string {
  return term
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8)
    .map((w) => `${w.slice(0, 40)}:*`)
    .join(' & ');
}
