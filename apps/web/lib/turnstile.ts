const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: token,
      }),
    });

    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * For public form routes: the request must carry a Turnstile token that Cloudflare accepts. Returns a 400 response to
 * send back when it doesn't (a missing token fails too; checking only when one was sent let bots simply leave it out),
 * or null when the visitor passed. Without TURNSTILE_SECRET_KEY (local setups without keys) every token passes.
 */
export async function humanCheckFailed(token: unknown): Promise<Response | null> {
  if (!TURNSTILE_SECRET) return null;
  if (typeof token === 'string' && token.length > 0 && token.length < 4096 && await verifyTurnstileToken(token)) return null;
  return Response.json({ error: 'Complete the security check and try again.', code: 'captcha' }, { status: 400 });
}
