import crypto from 'crypto';

/**
 * A 6-digit code emailed to a founder to confirm a sensitive team action. The browser holds a signed token and
 * sends it back with the code.
 *
 * The token carries a keyed hash (HMAC) of the code, the founder and the action. It used to carry a plain SHA-256
 * of the code: with only 900,000 possible codes, anyone holding the token could find the code in under a second
 * without ever seeing the email. A keyed hash can't be reversed without the server's secret, and binding it to the
 * founder and the action means a token can't be used by someone else or for a different action.
 */

const OTP_EXPIRY_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET is not set');
  return `${s}:action-otp`;
}

const codeMac = (code: string, userId: string, action: string, expires: number) =>
  crypto.createHmac('sha256', secret()).update(`${code}\n${userId}\n${action}\n${expires}`).digest('hex');

export function generateOTP(userId: string, action: string): { code: string; token: string } {
  const code = crypto.randomInt(100000, 1000000).toString();
  const e = Date.now() + OTP_EXPIRY_MS;
  const token = Buffer.from(JSON.stringify({ m: codeMac(code, userId, action, e), e })).toString('base64url');
  return { code, token };
}

export function verifyOTP(token: string, code: string, userId: string, action: string): { valid: boolean; error?: string } {
  try {
    const { m, e } = JSON.parse(Buffer.from(token, 'base64url').toString());
    if (typeof m !== 'string' || typeof e !== 'number') return { valid: false, error: 'Invalid verification token' };
    if (e < Date.now()) return { valid: false, error: 'Code expired — request a new one' };
    const given = Buffer.from(m, 'hex');
    const expected = Buffer.from(codeMac(String(code).replace(/\D/g, ''), userId, action, e), 'hex');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { valid: false, error: 'Incorrect code' };
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid verification token' };
  }
}
