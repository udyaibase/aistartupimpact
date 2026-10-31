import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { EVENT_BOOST, isPlatformOrganizer } from '@/lib/events/plans';

/**
 * A host's first published event gets a free Event Boost: featured until it ends, 1 promo email, and up to
 * 1,000 registrations. Once per host account (claimed atomically); Udyaibase's own accounts don't need it.
 * Returns true when the boost was applied.
 */
export async function applyFirstEventBoost(organizerId: string, eventId: string): Promise<boolean> {
  const [o, ev] = await Promise.all([
    prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { email: true, name: true, freeBoostUsedAt: true } }),
    prisma.event.findFirst({ where: { id: eventId, organizerId, status: 'PUBLISHED', deletedAt: null }, select: { title: true, slug: true, endAt: true, boostedAt: true, featuredUntil: true } }),
  ]);
  if (!o || !ev || o.freeBoostUsedAt || ev.boostedAt || isPlatformOrganizer(o.email) || ev.endAt <= new Date()) return false;
  const claimed = await prisma.eventOrganizer.updateMany({ where: { id: organizerId, freeBoostUsedAt: null }, data: { freeBoostUsedAt: new Date() } });
  if (!claimed.count) return false;
  const until = ev.featuredUntil && ev.featuredUntil > ev.endAt ? ev.featuredUntil : ev.endAt;
  await prisma.event.update({ where: { id: eventId }, data: { boostedAt: new Date(), featuredUntil: until, promoCredits: { increment: EVENT_BOOST.promoEmails } } });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  sendEmailFireAndForget({
    to: o.email,
    subject: `${ev.title} is live, and boosted for free`,
    type: 'organizer_free_boost',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your first event is boosted for free</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">To help <strong>${esc(ev.title)}</strong> fill up, it has a free Event Boost:</p>
<ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7">
${EVENT_BOOST.features.map((f) => `<li>${esc(f)}</li>`).join('')}
</ul>
<p style="margin:0 0 24px">${button(`${site}/organizer/promote`, 'Send your promo email')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">One free Boost per account, on your first event. Nothing is charged.</p>`),
  });
  return true;
}
