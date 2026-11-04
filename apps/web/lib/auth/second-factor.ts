import { SignJWT } from 'jose';
import { prisma } from '@udyaibase/database';
import { isTwoFactorOn } from '@/lib/auth/account-two-factor';

export type SecondFactorChallenge = { challengeToken: string; userType: 'webuser' | 'founder' | 'organizer' };

const challenge = (userId: string, userType: SecondFactorChallenge['userType'], secret: string) =>
  new SignJWT({ userId, userType, purpose: '2fa-challenge' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));

/**
 * 2FA is one setting per person. If it's on, every way of signing in must ask for the code: the password was right (or
 * Google said yes), and this is the second step. Returns the challenge to complete, or null when 2FA is off. It's
 * answered on whichever account record this person has, to start the right kind of session. Tokens last 5 minutes and
 * are useless without the code.
 */
export async function secondFactorChallenge(email: string): Promise<SecondFactorChallenge | null> {
  const address = email.toLowerCase();
  if (!(await isTwoFactorOn(address))) return null;

  const web = await prisma.webUser.findUnique({ where: { email: address }, select: { id: true } });
  if (web) return { challengeToken: await challenge(web.id, 'webuser', process.env.USER_JWT_SECRET!), userType: 'webuser' };

  const founder = await prisma.founderUser.findUnique({ where: { email: address }, select: { id: true } });
  if (founder) return { challengeToken: await challenge(founder.id, 'founder', process.env.FOUNDER_JWT_SECRET!), userType: 'founder' };

  const organizer = await prisma.eventOrganizer.findFirst({ where: { email: address }, select: { id: true } });
  if (organizer) return { challengeToken: await challenge(organizer.id, 'organizer', process.env.USER_JWT_SECRET!), userType: 'organizer' };
  return null;
}
