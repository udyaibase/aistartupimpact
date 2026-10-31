/**
 * Generate a URL-safe slug from text.
 * Example: "Best AI Tools for 2025" → "best-ai-tools-for-2025"
 */
export function generateSlug(text: string): string {
  const slug = text
    .slice(0, 500)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  // Trim edge dashes without a regex (an anchored `-+$` can backtrack badly on long dash runs).
  let start = 0;
  let end = slug.length;
  while (start < end && slug[start] === '-') start++;
  while (end > start && slug[end - 1] === '-') end--;
  return slug.slice(start, end);
}

/**
 * Generate a unique slug by appending a short suffix
 */
export function generateUniqueSlug(text: string): string {
  const base = generateSlug(text);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}
