import { accountLockoutHtml } from '@udyaibase/utils';
import { sql } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';

export type TwoFactorAccount = 'webuser' | 'founder' | 'organizer';

export const MAX_2FA_ATTEMPTS = 5;
export const TWO_FACTOR_LOCK_MINUTES = 15;
export const TWO_FACTOR_LOCKED_MESSAGE = `Too many wrong codes. For your security, try again in ${TWO_FACTOR_LOCK_MINUTES} minutes.`;

/**
 * A wrong 2FA code counts like a wrong password, on the same counter, so guesses can't continue by signing in again:
 * sign-in only resets the counter once no code is needed, and a right code resets it here. The database does the
 * counting and the clock, so simultaneous guesses can't slip past the limit.
 */
export async function isTwoFactorLocked(account: TwoFactorAccount, id: string): Promise<boolean> {
  const rows = account === 'webuser'
    ? await sql`SELECT "lockedUntil" > NOW() AS locked FROM "WebUser" WHERE id = ${id}`
    : account === 'founder'
      ? await sql`SELECT "lockedUntil" > NOW() AS locked FROM "FounderUser" WHERE id = ${id}`
      : await sql`SELECT "lockedUntil" > NOW() AS locked FROM "EventOrganizer" WHERE id = ${id}`;
  return rows[0]?.locked === true;
}

/** Records a wrong code. Returns true when this attempt locked the account. */
export async function recordTwoFactorFailure(account: TwoFactorAccount, id: string): Promise<boolean> {
  const rows = account === 'webuser'
    ? await sql`
        UPDATE "WebUser"
        SET "failedLoginAttempts" = COALESCE("failedLoginAttempts", 0) + 1,
            "lockedUntil" = CASE WHEN COALESCE("failedLoginAttempts", 0) + 1 >= ${MAX_2FA_ATTEMPTS}
              THEN NOW() + make_interval(mins => ${TWO_FACTOR_LOCK_MINUTES}) ELSE "lockedUntil" END
        WHERE id = ${id} RETURNING "failedLoginAttempts" AS attempts, email, name`
    : account === 'founder'
      ? await sql`
          UPDATE "FounderUser"
          SET "failedLoginAttempts" = COALESCE("failedLoginAttempts", 0) + 1,
              "lockedUntil" = CASE WHEN COALESCE("failedLoginAttempts", 0) + 1 >= ${MAX_2FA_ATTEMPTS}
                THEN NOW() + make_interval(mins => ${TWO_FACTOR_LOCK_MINUTES}) ELSE "lockedUntil" END
          WHERE id = ${id} RETURNING "failedLoginAttempts" AS attempts, email, name`
      : await sql`
          UPDATE "EventOrganizer"
          SET "failedLoginAttempts" = COALESCE("failedLoginAttempts", 0) + 1,
              "lockedUntil" = CASE WHEN COALESCE("failedLoginAttempts", 0) + 1 >= ${MAX_2FA_ATTEMPTS}
                THEN NOW() + make_interval(mins => ${TWO_FACTOR_LOCK_MINUTES}) ELSE "lockedUntil" END
          WHERE id = ${id} RETURNING "failedLoginAttempts" AS attempts, email, name`;

  const locked = Number(rows[0]?.attempts ?? 0) >= MAX_2FA_ATTEMPTS;
  if (locked) await sendLockoutEmail(rows[0].email as string, rows[0].name as string);
  return locked;
}

/** Waited for, because a serverless function can stop once it responds, but a failed email never changes the result. */
async function sendLockoutEmail(to: string, name: string): Promise<void> {
  const site = process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com';
  await sendEmail({
    to,
    subject: 'Security alert: someone tried to sign in to your account',
    html: accountLockoutHtml({ name, reason: 'two_factor', minutes: TWO_FACTOR_LOCK_MINUTES, resetUrl: `${site}/auth/forgot-password` }),
    type: 'security_alert',
  }).catch((err: unknown) => console.error('[2fa] lockout email failed', err instanceof Error ? err.message : 'unknown error'));
}

export async function clearTwoFactorFailures(account: TwoFactorAccount, id: string): Promise<void> {
  if (account === 'webuser') await sql`UPDATE "WebUser" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = ${id}`;
  else if (account === 'founder') await sql`UPDATE "FounderUser" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = ${id}`;
  else await sql`UPDATE "EventOrganizer" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = ${id}`;
}
