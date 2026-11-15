import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@udyaibase/database';

/**
 * Talent pool membership from the candidate's side: signed links to leave or extend, without signing in.
 *
 * A person can be in a company's pool through several applications (one per role they applied to). Leaving or
 * extending always applies to all of them, so "leave" really means leave, and the 12 months restart together.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
export const POOL_DAYS = 365;
/** The "ends in 30 days" email goes out this many days before the end. */
export const POOL_REMINDER_DAYS = 30;
const DAY = 864e5;

export type PoolAction = 'leave' | 'extend';

/** Same key as the other employer-side signed links (careers "get notified"), with the same fallback. */
function secret(): string {
  const s = process.env.EMPLOYER_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('EMPLOYER_JWT_SECRET is not configured');
  return s;
}

/** Signature for one action on one application. Separate purposes, so a leave link can't extend and vice versa. */
export function poolToken(applicationId: string, action: PoolAction): string {
  return createHmac('sha256', secret()).update(`talent-pool:${action}:${applicationId}`).digest('base64url');
}

export function verifyPoolToken(applicationId: string, action: PoolAction, token: string): boolean {
  if (!applicationId || !token || typeof token !== 'string') return false;
  try {
    const want = Buffer.from(poolToken(applicationId, action));
    const got = Buffer.from(token);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch (err) {
    console.error('[talent-pool] cannot verify link:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Page link (button press, never a GET that changes anything, so email scanners can't act on it). */
export function poolLink(applicationId: string, action: PoolAction): string {
  return `${SITE}/talent-pool?${new URLSearchParams({ a: action, id: applicationId, t: poolToken(applicationId, action) })}`;
}

/** One-click unsubscribe target for the List-Unsubscribe header (RFC 8058: POST, no page). */
export function poolOneClickUrl(applicationId: string): string {
  return `${SITE}/api/talent-pool/leave?${new URLSearchParams({ id: applicationId, t: poolToken(applicationId, 'leave') })}`;
}

export function poolEmailHeaders(applicationId: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${poolOneClickUrl(applicationId)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

/** The person behind an application, scoped to the company they applied to. Null once erased. */
async function personOf(applicationId: string) {
  const a = await prisma.jobBoardApplication.findUnique({
    where: { id: applicationId },
    select: { email: true, fullName: true, Listing: { select: { employerId: true } } },
  });
  if (!a || a.email.endsWith('@deleted.invalid')) return null;
  return { email: a.email, employerId: a.Listing.employerId, firstName: a.fullName.split(' ')[0] || a.fullName };
}

const samePerson = (p: { email: string; employerId: string }) => ({
  email: { equals: p.email, mode: 'insensitive' as const },
  Listing: { employerId: p.employerId },
});

export async function leavePool(applicationId: string): Promise<{ ok: boolean; employerId?: string }> {
  const p = await personOf(applicationId);
  if (!p) return { ok: false };
  await prisma.jobBoardApplication.updateMany({
    where: { ...samePerson(p), talentPoolUntil: { not: null } },
    data: { talentPoolUntil: null, talentPoolReminderAt: null },
  });
  return { ok: true, employerId: p.employerId };
}

/**
 * Another 12 months from today: a fresh, explicit consent. Works while they're in the pool and in the 30 days after
 * it ends (before their data is deleted); not for someone who left, since that was their choice.
 */
export async function extendPool(applicationId: string, now = new Date()): Promise<{ ok: boolean; until?: Date; employerId?: string }> {
  const p = await personOf(applicationId);
  if (!p) return { ok: false };
  const until = new Date(now.getTime() + POOL_DAYS * DAY);
  const res = await prisma.jobBoardApplication.updateMany({
    where: { ...samePerson(p), talentPoolUntil: { gt: new Date(now.getTime() - POOL_REMINDER_DAYS * DAY) } },
    data: { talentPoolUntil: until, talentPoolReminderAt: null },
  });
  return res.count > 0 ? { ok: true, until, employerId: p.employerId } : { ok: false };
}

/** Company name for the candidate-facing pages and emails (verified startup name when there is one). */
export async function poolCompanyName(employerId: string): Promise<string> {
  const { employerContext } = await import('@/lib/employer/applications');
  return (await employerContext(employerId)).company;
}
