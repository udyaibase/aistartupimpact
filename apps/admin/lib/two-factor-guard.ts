import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@udyaibase/database';

/**
 * Brute-force protection for 2FA codes. Uses the account lock that Google sign-in already honours
 * (failedLoginAttempts / lockedUntil), so 5 wrong codes lock the account — sign-in included — for 15 minutes.
 */

export const MAX_CODE_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function lockedResponse(lockedUntil: Date) {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));
  return NextResponse.json(
    { success: false, error: `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, lockedUntil },
    { status: 429 },
  );
}

export function isLocked(user: { lockedUntil: Date | null }): user is { lockedUntil: Date } {
  return !!user.lockedUntil && user.lockedUntil > new Date();
}

/** Records a wrong code. Returns the lock time if this attempt locked the account. */
export async function recordCodeFailure(userId: string, previousFailures: number): Promise<{ attemptsLeft: number; lockedUntil: Date | null }> {
  const attempts = previousFailures + 1;
  const lockedUntil = attempts >= MAX_CODE_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null;
  await prisma.user.update({
    where: { id: userId },
    data: lockedUntil ? { failedLoginAttempts: attempts, lockedUntil } : { failedLoginAttempts: attempts },
  });
  return { attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - attempts), lockedUntil };
}

export async function clearCodeFailures(userId: string, previousFailures: number) {
  if (previousFailures > 0) {
    await prisma.user.update({ where: { id: userId }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }
}

export function wrongCodeResponse(message: string, result: { attemptsLeft: number; lockedUntil: Date | null }) {
  if (result.lockedUntil) return lockedResponse(result.lockedUntil);
  return NextResponse.json(
    { success: false, error: `${message} ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`, attemptsLeft: result.attemptsLeft },
    { status: 400 },
  );
}

/** The signed-in session's id for this sign-in (sid), used to bind the 2FA proof. */
export async function currentSignInId(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return typeof token?.sid === 'string' ? token.sid : null;
}

export const USER_2FA_SELECT = {
  id: true,
  email: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorBackupCodes: true,
  failedLoginAttempts: true,
  lockedUntil: true,
} as const;
