import { isSafePublicUrl } from '@udyaibase/utils/safe-url';

/**
 * Fetching for the career scraper. Every URL — the one typed, each redirect hop, each ATS feed — must point at the
 * public internet (see safe-url). Responses are size-capped and time-limited.
 */

export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_HTML_BYTES = 3_000_000;
// Big companies' job-board feeds are large (OpenAI's Ashby feed is ~14 MB with descriptions).
const MAX_JSON_BYTES = 30_000_000;
const MAX_REDIRECTS = 5;

export const isPublicUrl = (url: string | URL) => {
  try {
    return isSafePublicUrl(typeof url === 'string' ? new URL(url) : url, { allowHttp: true });
  } catch {
    return Promise.resolve(false);
  }
};

/** Quick shape check before any network work: http(s) and a parseable URL. */
export function isWebUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > maxBytes) { reader.cancel().catch(() => {}); return null; }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** GET with every redirect hop re-checked. Returns the body (capped) and the final URL, or null. */
export async function safeGet(
  url: string,
  opts: { accept?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ body: string; finalUrl: string; contentType: string } | null> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  let current: URL;
  try { current = new URL(url); } catch { return null; }
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isPublicUrl(current))) return null;
      const res = await fetch(current, {
        redirect: 'manual',
        signal,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        current = new URL(loc, current);
        continue;
      }
      if (!res.ok) return null;
      const body = await readCapped(res, opts.maxBytes ?? MAX_HTML_BYTES);
      return body == null ? null : { body, finalUrl: current.toString(), contentType: res.headers.get('content-type') ?? '' };
    }
  } catch {
    // timeout, DNS or network failure
  }
  return null;
}

export const fetchHtml = (url: string) => safeGet(url);

export async function fetchJson<T = unknown>(url: string, timeoutMs = 30_000): Promise<T | null> {
  const res = await safeGet(url, { accept: 'application/json', timeoutMs, maxBytes: MAX_JSON_BYTES });
  if (!res) return null;
  try { return JSON.parse(res.body) as T; } catch { return null; }
}
