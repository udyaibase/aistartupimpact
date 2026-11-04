import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@udyaibase/database';
import { verifyFounderToken } from '@/lib/founder-auth';
import { getUnifiedSession } from '@/lib/unified-auth';

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
  if (userToken) {
    try {
      const { payload } = await jwtVerify(userToken, new TextEncoder().encode(process.env.USER_JWT_SECRET!));
      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
      if (email) return prisma.founderUser.findUnique({ where: { email }, select });
    } catch { /* expired or invalid: not signed in */ }
  }
  return null;
}
