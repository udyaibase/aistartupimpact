import { prisma } from '@udyaibase/database';
import { promoteWaitlist } from '@/lib/events/waitlist';
import { refreshPaths } from '@/lib/revalidate';

/**
 * Registration needs no account and no "confirm your email" step, so anyone can type anyone's address. These keep
 * that from being used against a person:
 *   - an address can be registered for only a few events a day;
 *   - every registration email has an "I didn't register" link that cancels it and blocks the address for a while.
 */

/** Guest registrations one email address may make in 24 hours, across all events. */
export const DAILY_REGISTRATIONS_PER_EMAIL = 5;
/** How long an address stays blocked after its owner says "I didn't register". */
export const NOT_ME_BLOCK_DAYS = 90;
/** Marks a registration its owner disowned. Kept in "waitlistReason", which a cancelled registration doesn't use. */
export const NOT_ME_REASON = 'not_me';

const DAY = 864e5;

/** The owner of this address said "I didn't register" in the last 90 days. */
export async function emailBlocked(email: string, now = Date.now()): Promise<boolean> {
  const row = await prisma.eventRegistration.findFirst({
    where: { guestEmail: email, status: 'CANCELLED', waitlistReason: NOT_ME_REASON, cancelledAt: { gt: new Date(now - NOT_ME_BLOCK_DAYS * DAY) } },
    select: { id: true },
  });
  return !!row;
}

/** This address has used up today's registrations (walk-ins added by a host don't count). */
export async function emailOverDailyLimit(email: string, now = Date.now()): Promise<boolean> {
  const n = await prisma.eventRegistration.count({
    where: { guestEmail: email, registeredAt: { gt: new Date(now - DAY) }, registrationSource: { not: 'WALK_IN' } },
  });
  return n >= DAILY_REGISTRATIONS_PER_EMAIL;
}

export type NotMeResult = 'cancelled' | 'already' | 'paid' | 'attended' | 'missing';

/**
 * The person at this address says they never registered: cancel it, give the seat to the next person waiting, and
 * block the address. A paid or used ticket is left alone (someone paid or turned up); support handles those.
 */
export async function reportNotMe(registrationId: string): Promise<NotMeResult> {
  const reg = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, eventId: true, status: true, paymentStatus: true, waitlistReason: true, deletedAt: true, event: { select: { slug: true } } },
  });
  if (!reg || reg.deletedAt) return 'missing';
  if (reg.status === 'CANCELLED' && reg.waitlistReason === NOT_ME_REASON) return 'already';
  if (reg.status === 'CHECKED_IN') return 'attended';
  if (reg.paymentStatus === 'PAID') return 'paid';

  // The block runs from now, also for a registration that was cancelled earlier for another reason.
  await prisma.eventRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELLED', waitlistReason: NOT_ME_REASON, cancelledAt: new Date() } });
  if (reg.status !== 'CANCELLED') {
    await promoteWaitlist(reg.eventId).catch(() => 0);
    refreshPaths([`/events/${reg.event.slug}`]);
  }
  return 'cancelled';
}
