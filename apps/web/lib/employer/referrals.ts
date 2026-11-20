import crypto from 'node:crypto';
import { prisma } from '@udyaibase/database';

/**
 * Team referral links: each teammate (and the workspace account) gets one short code. Anyone who applies through
 * `/jobs/<slug>?rc=<code>` is tagged as a Referral from that person, so the team sees who brought them in.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes (l/1, o/0)
export const REFERRAL_PARAM = 'rc';

export function newReferralCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const isReferralCode = (v: unknown): v is string => typeof v === 'string' && /^[a-z2-9]{6,16}$/.test(v);

export const referralJobLink = (jobSlug: string, code: string) => `${SITE}/jobs/${encodeURIComponent(jobSlug)}?${REFERRAL_PARAM}=${code}`;

/** The signed-in person's referral code for this workspace, created on first use. */
export async function getOrCreateReferrer(employerId: string, who: { email: string; name: string; memberId: string | null }) {
  const email = who.email.toLowerCase();
  const existing = await prisma.jobBoardReferrer.findUnique({ where: { employerId_email: { employerId, email } }, select: { id: true, code: true } });
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    try {
      return await prisma.jobBoardReferrer.create({
        data: { employerId, email, name: who.name.slice(0, 100), memberId: who.memberId, code: newReferralCode() },
        select: { id: true, code: true },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      // Same person created it at the same moment, or (rarely) the code was taken: read again or try a new code.
      const again = await prisma.jobBoardReferrer.findUnique({ where: { employerId_email: { employerId, email } }, select: { id: true, code: true } });
      if (again) return again;
    }
  }
  throw new Error('Could not create a referral code');
}

/** The referrer behind a code, only if it belongs to the company that posted the job. */
export async function referrerFor(code: unknown, employerId: string): Promise<{ id: string; name: string } | null> {
  if (!isReferralCode(code)) return null;
  const r = await prisma.jobBoardReferrer.findUnique({ where: { code }, select: { id: true, name: true, employerId: true } });
  return r && r.employerId === employerId ? { id: r.id, name: r.name } : null;
}
