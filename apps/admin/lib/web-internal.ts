/**
 * Server-to-server calls to the public web app (Bearer INTERNAL_API_SECRET, the same value on both projects).
 * Returns null when the secret is not set or the web app can't be reached; callers say so instead of failing.
 */
export async function callWeb(path: string, body: unknown, timeoutMs = 15000): Promise<Response | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;
  const base = (process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  try {
    return await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[callWeb]', path, err instanceof Error ? err.message : err);
    return null;
  }
}

const webBase = () => (process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

/**
 * Why a call to the website failed, in words an admin can act on. Pass the response from `callWeb`
 * (null when nothing came back). Returns null when the call was accepted.
 */
export function webLinkProblem(res: Response | null): string | null {
  if (!process.env.INTERNAL_API_SECRET) return 'INTERNAL_API_SECRET is not set on the admin app, so it cannot talk to the website. Set the same value on the admin and the website, then restart both.';
  if (!res) return `The website at ${webBase()} did not answer. Check that it is running and that WEB_APP_URL on the admin points to it.`;
  if (res.status === 401) return 'The website refused the admin’s key. INTERNAL_API_SECRET is missing on the website or differs from the admin’s; set the same value on both.';
  if (res.status === 404) return `The website at ${webBase()} does not have this feature yet. Deploy the website with the same version as the admin.`;
  return null;
}
