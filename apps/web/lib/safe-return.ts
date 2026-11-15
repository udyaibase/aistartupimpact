/**
 * A "send me back here after sign-in" value from the URL, kept only when it is a path on this site.
 * Browsers read "/\\host" and "//host" as another website, so the value is resolved and its origin compared
 * instead of trusting how it starts.
 */
export function safeReturnPath(value: unknown, fallback = '/profile'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 2000) return fallback;
  try {
    const base = 'https://site.invalid';
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
