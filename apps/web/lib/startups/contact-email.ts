import { SignJWT, jwtVerify } from 'jose';
import { jwtSecret } from '@/lib/jwt-secret';
import { prisma } from '@udyaibase/database';

/**
 * A startup's private contact email (admin and platform emails only, never public).
 * The founder proves they receive mail there with a 6-digit code before the startup exists, so the proof is a
 * short-lived signed token naming this founder and this address. Submit and edit accept the address only with it.
 */
const SECRET = jwtSecret(process.env.FOUNDER_JWT_SECRET, 'FOUNDER_JWT_SECRET');
const AUDIENCE = 'startup-contact-email';
const PROOF_TTL = '2h';

export const CONTACT_EMAIL_MAX = 254;

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return email.length <= CONTACT_EMAIL_MAX && /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}

export async function signContactEmailProof(founderUserId: string, email: string): Promise<string> {
  return new SignJWT({ email: normalizeEmail(email) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(founderUserId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(PROOF_TTL)
    .sign(SECRET);
}

async function proofMatches(proof: string, founderUserId: string, email: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(proof, SECRET, { audience: AUDIENCE, subject: founderUserId });
    return payload.email === normalizeEmail(email);
  } catch {
    return false;
  }
}

/** The founder's own sign-in email (or verified work email) needs no code: they already proved it. */
export async function founderAlreadyOwnsEmail(founderUserId: string, email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  const u = await prisma.founderUser.findUnique({
    where: { id: founderUserId },
    select: { email: true, emailVerified: true, authProvider: true, companyEmail: true, companyEmailVerified: true },
  });
  if (!u) return false;
  // Google sign-in addresses are verified by Google.
  if (normalizeEmail(u.email) === e && (u.emailVerified || u.authProvider === 'google')) return true;
  return !!u.companyEmail && u.companyEmailVerified && normalizeEmail(u.companyEmail) === e;
}

/** True when the founder has proven this address: their own verified email, or a valid code proof. */
export async function contactEmailConfirmed(founderUserId: string, email: string, proof: string | null | undefined): Promise<boolean> {
  if (!isPlausibleEmail(normalizeEmail(email))) return false;
  if (proof && (await proofMatches(proof, founderUserId, email))) return true;
  return founderAlreadyOwnsEmail(founderUserId, email);
}
