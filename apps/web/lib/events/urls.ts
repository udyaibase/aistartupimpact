/** URL checks shared by server code and browser components (no database or image libraries here). */

/** https links only (no javascript:, data:, http:), trimmed and capped. */
export function cleanHttpsUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 500) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !!u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

function mediaHosts(): string[] {
  const hosts = ['media.udyaibase.com'];
  try { if (process.env.R2_PUBLIC_URL) hosts.push(new URL(process.env.R2_PUBLIC_URL).hostname); } catch { /* ignore */ }
  return hosts;
}

/** Our own uploads only (logos, signatures, photos): never an arbitrary URL from a request. */
export function isOwnMediaUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && mediaHosts().includes(u.hostname);
  } catch {
    return false;
  }
}
