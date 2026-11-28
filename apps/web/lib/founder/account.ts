import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { verifyUserTokenSession } from '@/lib/user-session';
import { prisma } from '@udyaibase/database';
import { verifyFounderToken } from '@/lib/founder-auth';
import { getUnifiedSession } from '@/lib/unified-auth';
import { verifyOTP } from '@/lib/action-otp';

/**
 * A person can have a password on any of their sign-in records, or none at all (Google). Returns those hashes, so a
 * Google-only founder isn't asked for a password they don't have, and anyone with one must really enter it.
 */
async function passwordHashes(email: string): Promise<string[]> {
  const [founder, web, unified] = await Promise.all([
    prisma.founderUser.findUnique({ where: { email }, select: { passwordHash: true } }),
    prisma.webUser.findUnique({ where: { email }, select: { passwordHash: true } }),
    prisma.unifiedUser.findUnique({ where: { email }, select: { passwordHash: true } }),
  ]);
  return [founder?.passwordHash, web?.passwordHash, unified?.passwordHash].filter((h): h is string => !!h);
}

export async function accountHasPassword(email: string): Promise<boolean> {
  return (await passwordHashes(email)).length > 0;
}

/** True when the account has no password at all, or this matches one of its passwords. */
export async function confirmAccountPassword(email: string, password: unknown): Promise<boolean> {
  const hashes = await passwordHashes(email);
  if (hashes.length === 0) return true;
  if (typeof password !== 'string' || !password) return false;
  for (const hash of hashes) {
    if (await bcrypt.compare(password, hash)) return true;
  }
  return false;
}

export type AccountAction = 'deactivate' | 'delete';
export const accountActionKey = (action: AccountAction) => `account_${action}`;

/**
 * Confirms it's really the account holder before deactivating or deleting. With a password on file, that password.
 * Without one (Google sign-in), a 6-digit code emailed to them: a signed-in browser alone isn't enough to delete an account.
 */
export async function confirmAccountAction(
  session: { userId: string; email: string },
  body: { password?: unknown; otpToken?: unknown; code?: unknown },
  action: AccountAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = session.email.toLowerCase();
  if (await accountHasPassword(email)) {
    return (await confirmAccountPassword(email, body.password)) ? { ok: true } : { ok: false, error: 'Incorrect password' };
  }
  if (typeof body.otpToken !== 'string' || typeof body.code !== 'string' || !body.code.trim()) {
    return { ok: false, error: 'Enter the code we emailed you.' };
  }
  const result = verifyOTP(body.otpToken, body.code, session.userId, accountActionKey(action));
  return result.valid ? { ok: true } : { ok: false, error: result.error ?? 'Incorrect code' };
}

/**
 * The founder record behind this browser's sign-in, even when it's deactivated or suspended (getFounderSession
 * hides those). Only for the reactivation flow and the portal's account-state check.
 */
export async function founderFromCookies() {
  const select = { id: true, email: true, name: true, status: true, deactivatedAt: true, onboardingCompleted: true } as const;

  const unified = await getUnifiedSession();
  if (unified?.founderId) {
    const founder = await prisma.founderUser.findUnique({ where: { id: unified.founderId }, select });
    if (founder) return founder;
  }

  const store = await cookies();
  const founderToken = store.get('founder-token')?.value;
  const session = founderToken ? await verifyFounderToken(founderToken) : null;
  if (session) {
    const founder = await prisma.founderUser.findUnique({ where: { id: session.userId }, select });
    if (founder) return founder;
  }

  const userToken = store.get('user-token')?.value;
  // A site sign-in counts only while its session record exists: a password change or sign-out removes it, and an old
  // copy of the cookie must not be able to reactivate the account or pass the portal's account check.
  const live = await verifyUserTokenSession(userToken);
  if (live) return prisma.founderUser.findUnique({ where: { email: live.email }, select });
  return null;
}
