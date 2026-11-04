import { createHmac } from 'crypto';

/**
 * The DNS token a founder must publish to prove they control a startup's domain. Each founder gets their own, so
 * a record added by the real owner can never be used by someone else who also started a claim. Starting a claim
 * changes nothing on the startup: ownership is granted only by proof (see markStartupVerified).
 *
 * An owner who already has a stored token keeps it, so a record they've already added keeps working.
 */
export function claimToken(
  startup: { id: string; ownerId: string | null; verificationToken: string | null },
  founderUserId: string,
): string {
  if (startup.ownerId === founderUserId && startup.verificationToken) return startup.verificationToken;
  const secret = process.env.FOUNDER_JWT_SECRET;
  if (!secret) throw new Error('FOUNDER_JWT_SECRET is not set');
  const digest = createHmac('sha256', secret).update(`startup-claim:${startup.id}:${founderUserId}`).digest('hex');
  return `ub_${digest.slice(0, 32)}`;
}
