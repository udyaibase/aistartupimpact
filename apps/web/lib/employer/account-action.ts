import crypto from 'crypto';
import { sql } from '@/lib/db';
import { emailCodeAllowed } from '@/lib/rate-limit';
import { checkDomainCode } from '@/lib/startups/domain-otp';
import { sendAccountActionCode } from '@/lib/employer/team';

/**
 * Deleting or deactivating a workspace is confirmed with a code sent to the signed-in owner's email. New accounts
 * have no password, so this is the one check that works for everyone.
 */
const PURPOSE = 'employer_account_action';

export type ActionCodeResult = { ok: true } | { ok: false; status: number; error: string };

export async function sendActionCode(email: string): Promise<ActionCodeResult> {
  const to = email.trim().toLowerCase();
  if (!(await emailCodeAllowed(to, PURPOSE))) {
    return { ok: false, status: 429, error: 'Too many codes requested. Try again in 15 minutes.' };
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  await sql`DELETE FROM "EmailOtp" WHERE email = ${to} AND purpose = ${PURPOSE}`;
  await sql`INSERT INTO "EmailOtp" (id, email, code, purpose, "expiresAt", "createdAt")
    VALUES (gen_random_uuid()::text, ${to}, ${crypto.createHash('sha256').update(code).digest('hex')}, ${PURPOSE}, ${new Date(Date.now() + 600_000).toISOString()}::timestamp, NOW())`;
  await sendAccountActionCode(to, code);
  return { ok: true };
}

/** Attempts are limited by checkDomainCode; a used code can't be used again. */
export async function checkActionCode(email: string, code: unknown): Promise<ActionCodeResult> {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length !== 6) return { ok: false, status: 400, error: 'Enter the 6-digit code from the email.' };
  const r = await checkDomainCode({ email: email.trim().toLowerCase(), purpose: PURPOSE, code: digits });
  return r.ok ? { ok: true } : { ok: false, status: r.status, error: r.error };
}
