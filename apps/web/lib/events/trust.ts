import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { isPlatformOrganizer } from '@/lib/events/plans';
import { featuredUntilFor } from '@/lib/events/billing';
import { applyFirstEventBoost } from '@/lib/events/free-boost';
import { refreshSections } from '@/lib/revalidate';
import { VERIFIED_CLAIM_METHODS } from '@/lib/jobs/trust';
import { refundEventTickets } from '@/lib/events/tickets';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { eventCancellationHtml } from '@udyaibase/utils';
import { SUSPENSION_NOTE } from '@udyaibase/utils/event-moderation';

/**
 * Event trust. Events are open to everyone, in tiers:
 * - Tagged to a startup ("Hosted by NeuralPay"): only a verified startup, by one of its own people → publishes at once.
 * - Verified organizer (an admin approved their first event) or Udyaibase → publishes at once.
 * - Anyone else → PENDING_REVIEW (not public) until an admin approves; approval makes them a verified organizer.
 * Reports: 3 distinct reporters in 14 days hide a published event (PENDING_REVIEW) for review.
 */

export { EVENT_REPORT_REASONS } from '@/lib/events/report-reasons';
export const EVENT_HOLD_THRESHOLD = 3;
const REPORT_WINDOW_DAYS = 14;

const norm = (e: string) => e.trim().toLowerCase();

/**
 * Verified startups these people belong to (their founder account, founder-portal team, or the startup's verified
 * hiring workspace). Only these can be tagged on an event.
 */
export async function taggableStartups(emails: string[]) {
  const list = Array.from(new Set(emails.filter(Boolean).map(norm)));
  if (!list.length) return [];
  const [founders, founderTeams, hiringTeams] = await Promise.all([
    prisma.founderUser.findMany({ where: { email: { in: list, mode: 'insensitive' } }, select: { id: true } }),
    prisma.founderTeamMember.findMany({ where: { email: { in: list, mode: 'insensitive' }, status: 'ACTIVE' }, select: { founderId: true } }),
    prisma.jobBoardTeamMember.findMany({
      where: { email: { in: list }, status: 'ACTIVE', Employer: { startupId: { not: null }, startupClaimMethod: { in: [...VERIFIED_CLAIM_METHODS] } } },
      select: { Employer: { select: { startupId: true } } },
    }),
  ]);
  const ownerIds = [...founders.map((f) => f.id), ...founderTeams.map((t) => t.founderId)];
  const hiringStartupIds = hiringTeams.map((t) => t.Employer.startupId!).filter(Boolean);
  if (!ownerIds.length && !hiringStartupIds.length) return [];
  return prisma.startup.findMany({
    where: {
      deletedAt: null, isVerified: true,
      OR: [...(ownerIds.length ? [{ ownerId: { in: ownerIds } }] : []), ...(hiringStartupIds.length ? [{ id: { in: hiringStartupIds } }] : [])],
    },
    select: { id: true, name: true, slug: true, logoUrl: true },
    orderBy: { name: 'asc' },
  });
}

/** The person signed in (and their host account) may tag this startup. */
export async function canTagStartup(emails: string[], startupId: string): Promise<boolean> {
  return (await taggableStartups(emails)).some((s) => s.id === startupId);
}

/** Published right away, or waiting for admin review. */
export async function publishDecision(organizerId: string, opts: { taggedStartup: boolean }): Promise<'PUBLISHED' | 'PENDING_REVIEW'> {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { email: true, verifiedAt: true } });
  if (!o) return 'PENDING_REVIEW';
  if (isPlatformOrganizer(o.email) || opts.taggedStartup || o.verifiedAt) return 'PUBLISHED';
  return 'PENDING_REVIEW';
}

/**
 * Steps that run when an event goes public, safe to repeat: Pro featured placement, the first-event free Boost and a
 * page refresh. Called on publish, after admin approval (when the admin app can reach us), and by the daily cron
 * for events approved in the last two days.
 */
export async function finishPublishedEvent(eventId: string) {
  const ev = await prisma.event.findFirst({ where: { id: eventId, status: 'PUBLISHED', deletedAt: null }, select: { id: true, organizerId: true, endAt: true, featuredUntil: true } });
  if (!ev) return false;
  const until = await featuredUntilFor(ev.organizerId, ev.endAt);
  if (until && (!ev.featuredUntil || ev.featuredUntil < until)) await prisma.event.update({ where: { id: ev.id }, data: { featuredUntil: until } });
  await applyFirstEventBoost(ev.organizerId, ev.id).catch((e) => console.error('[free boost]', e));
  refreshSections(['events', 'home']);
  return true;
}

export async function finishRecentlyApprovedEvents(now = new Date()) {
  const events = await prisma.event.findMany({
    where: { status: 'PUBLISHED', deletedAt: null, reviewedAt: { gte: new Date(now.getTime() - 2 * 864e5) }, endAt: { gt: now } },
    select: { id: true },
    take: 200,
  });
  for (const e of events) await finishPublishedEvent(e.id);
  return events.length;
}

export function eventReporterHash(ip: string, eventId: string): string {
  return crypto.createHash('sha256').update(`${process.env.APPLY_SESSION_SECRET ?? ''}:event-report:${ip}:${eventId}`).digest('hex').slice(0, 32);
}

/**
 * Record a report (repeat reports from the same person are ignored). Reaching the threshold of distinct reporters
 * hides a published event everywhere (PENDING_REVIEW) until an admin reviews it.
 */
export async function reportEvent(opts: { event: { id: string; title: string; slug: string }; reason: string; details: string; email: string | null; hash: string }) {
  const { event } = opts;
  const since = new Date(Date.now() - REPORT_WINDOW_DAYS * 864e5);
  const dup = await prisma.contentReport.findFirst({ where: { entityType: 'EVENT', entityId: event.id, reporterHash: opts.hash, createdAt: { gte: since } }, select: { id: true } });
  if (dup) return { duplicate: true, held: false };
  await prisma.contentReport.create({
    data: {
      entityType: 'EVENT', entityId: event.id, entityName: event.title, entitySlug: event.slug,
      reportType: opts.reason, description: opts.details || '(no details)', reporterEmail: opts.email, reporterHash: opts.hash,
    },
  });
  const reporters = await prisma.contentReport.findMany({
    where: { entityType: 'EVENT', entityId: event.id, status: { in: ['PENDING', 'REVIEWING'] }, createdAt: { gte: since } },
    distinct: ['reporterHash'],
    select: { reporterHash: true },
  });
  if (reporters.length < EVENT_HOLD_THRESHOLD) return { duplicate: false, held: false };
  const held = await prisma.event.updateMany({
    where: { id: event.id, status: 'PUBLISHED' },
    data: { status: 'PENDING_REVIEW', heldAt: new Date(), reviewNote: `Hidden after ${reporters.length} reports` },
  });
  if (held.count) refreshSections(['events', 'home']);
  return { duplicate: false, held: held.count > 0 };
}

/**
 * After an admin suspends an organizer (their upcoming events are cancelled with SUSPENSION_NOTE), tell each event's
 * attendees and refund paid tickets. Each event is handled once (reviewedAt marks it); safe to repeat.
 */
export async function processSuspendedEvents(opts: { organizerId?: string } = {}) {
  const events = await prisma.event.findMany({
    where: { status: 'CANCELLED', reviewNote: SUSPENSION_NOTE, reviewedAt: null, ...(opts.organizerId ? { organizerId: opts.organizerId } : {}) },
    select: { id: true, title: true, slug: true, startAt: true, timezone: true },
    take: 100,
  });
  const from = `Udyaibase Events <${process.env.RESEND_FROM_EMAIL || 'no-reply@udyaibase.com'}>`;
  for (const ev of events) {
    // Claim first, so two runs never email the same attendees twice.
    const claimed = await prisma.event.updateMany({ where: { id: ev.id, reviewedAt: null }, data: { reviewedAt: new Date() } });
    if (!claimed.count) continue;
    const attendees = await prisma.eventRegistration.findMany({
      where: { eventId: ev.id, deletedAt: null, status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING_APPROVAL', 'WAITLISTED'] } },
      select: { guestEmail: true, guestName: true },
    });
    const date = ev.startAt.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: ev.timezone || 'Asia/Kolkata' });
    for (const a of attendees) {
      if (a.guestEmail) sendEmailFireAndForget({ to: a.guestEmail, from, subject: `Event Cancelled: ${ev.title}`, html: eventCancellationHtml(a.guestName || 'there', ev.title, date), type: 'event_cancellation' });
    }
    await refundEventTickets(ev.id).catch((e) => console.error('[suspension refunds]', e));
  }
  if (events.length) refreshSections(['events', 'home']);
  return events.length;
}
