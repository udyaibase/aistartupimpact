import { randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@udyaibase/database';
import { founderNudgeHtml } from '@udyaibase/utils';
import { sendEmail } from '@/lib/email/send';
import { logFounderActivity } from '@/lib/founder/activity';
import { engagementContent, pickEngagementEmail, type EngagementEmail, type FounderFacts, type SentEmail } from '@/lib/founder/engagement';

const DAY = 86_400_000;
const MAX_PER_RUN = 200;
const secret = () => new TextEncoder().encode(process.env.FOUNDER_JWT_SECRET!);
const site = () => process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com';

/** Off until FOUNDER_ENGAGEMENT_EMAILS is set to "on". While off, a run only reports what it would send. */
export const engagementEmailsEnabled = () => process.env.FOUNDER_ENGAGEMENT_EMAILS === 'on';

export const unsubscribeToken = (founderId: string) =>
  new SignJWT({ founderId, purpose: 'founder-emails' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().sign(secret());

export async function founderFromUnsubscribeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.purpose === 'founder-emails' && typeof payload.founderId === 'string' ? payload.founderId : null;
  } catch {
    return null;
  }
}

/** What a founder's profile is missing, in words for the email. */
export function missingFromStartup(s: { logoUrl: string | null; description: string | null; foundersData: unknown; linkedinUrl: string | null; headquartersCity: string | null }): string[] {
  const missing: string[] = [];
  if (!s.logoUrl) missing.push('a logo');
  if ((s.description ?? '').trim().length < 100) missing.push('a full description');
  if (!Array.isArray(s.foundersData) || s.foundersData.length === 0) missing.push('your founders');
  if (!s.linkedinUrl) missing.push('your LinkedIn page');
  if (!s.headquartersCity) missing.push('your city');
  return missing;
}

async function factsFor(founder: { id: string; name: string; createdAt: Date; lastLoginAt: Date | null }, lastSeen: Date | null, now: number): Promise<FounderFacts> {
  const daysAgo = (d: Date) => Math.floor((now - new Date(d).getTime()) / DAY);
  const [startup, tool] = await Promise.all([
    prisma.startup.findFirst({
      where: { ownerId: founder.id, deletedAt: null },
      select: { id: true, name: true, slug: true, isApproved: true, isVerified: true, logoUrl: true, description: true, foundersData: true, linkedinUrl: true, headquartersCity: true, updatedAt: true },
    }),
    prisma.aiTool.findFirst({
      where: { ownerId: founder.id, deletedAt: null },
      select: { id: true, name: true, slug: true, status: true, logoUrl: true, updatedAt: true },
    }),
  ]);

  const listing: FounderFacts['listing'] = startup
    ? { name: startup.name, slug: startup.slug, kind: 'startup', isLive: startup.isApproved, isVerified: startup.isVerified, missing: missingFromStartup(startup), updatedDaysAgo: daysAgo(startup.updatedAt) }
    : tool
      ? { name: tool.name, slug: tool.slug, kind: 'tool', isLive: tool.status === 'APPROVED' || tool.status === 'FEATURED', isVerified: false, missing: tool.logoUrl ? [] : ['a logo'], updatedDaysAgo: daysAgo(tool.updatedAt) }
      : null;

  const entityId = startup?.id ?? tool?.id;
  const since = new Date(now - 7 * DAY);
  const [views, lastPost, openJobs, upcomingEvents] = await Promise.all([
    entityId
      ? prisma.$queryRaw<{ n: number }[]>`SELECT COALESCE(SUM(views), 0)::int AS n FROM "AnalyticsDaily" WHERE "entityType" = ${startup ? 'STARTUP' : 'TOOL'} AND "entityId" = ${entityId} AND date >= ${since}`
      : [{ n: 0 }],
    startup ? prisma.article.findFirst({ where: { startupId: startup.id, deletedAt: null, type: { in: ['FOUNDER_STORY', 'STARTUP_UPDATE'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }) : null,
    startup ? prisma.jobBoardListing.count({ where: { startupId: startup.id, status: 'OPEN', deletedAt: null } }) : 0,
    startup ? prisma.event.count({ where: { startupId: startup.id, deletedAt: null, endAt: { gte: new Date(now) } } }) : 0,
  ]);

  return {
    name: founder.name,
    accountAgeDays: daysAgo(founder.createdAt),
    listing,
    viewsLast7Days: views[0]?.n ?? 0,
    daysSinceLastPost: lastPost ? daysAgo(lastPost.createdAt) : null,
    openJobs,
    upcomingEvents,
    lastSignInDaysAgo: lastSeen ? daysAgo(lastSeen) : null,
  };
}

export type EngagementRun = { enabled: boolean; checked: number; optedOut: number; wouldSend: Record<string, number>; sent: number; failed: number };

/**
 * One daily run. Skips anyone suspended, deactivated, deleted, unverified or opted out. With sending off, it changes
 * nothing and only reports the counts.
 */
export async function runFounderEngagement(now = Date.now()): Promise<EngagementRun> {
  const enabled = engagementEmailsEnabled();
  const founders = await prisma.founderUser.findMany({
    where: { status: 'ACTIVE', emailVerified: true, deactivatedAt: null, deletedAt: null },
    select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true },
  });
  const optedOut = new Set((await prisma.founder_settings.findMany({
    where: { user_id: { in: founders.map((f) => f.id) }, email_notifications: false },
    select: { user_id: true },
  })).map((s) => s.user_id));

  const run: EngagementRun = { enabled, checked: founders.length, optedOut: optedOut.size, wouldSend: {}, sent: 0, failed: 0 };

  for (const founder of founders) {
    if (optedOut.has(founder.id)) continue;
    if (run.sent + run.failed >= MAX_PER_RUN) break;
    try {
      const log = await prisma.founderActivityLog.findMany({
        where: { founderId: founder.id, action: 'engagement_email' },
        select: { metadata: true, createdAt: true },
      });
      const history: SentEmail[] = log.map((l) => ({
        type: (l.metadata as { type?: EngagementEmail } | null)?.type ?? 'views_report',
        daysAgo: (now - new Date(l.createdAt).getTime()) / DAY,
      }));
      // Most sign-ins go through the main account, so the activity log knows better than lastLoginAt.
      const lastSignIn = await prisma.founderActivityLog.findFirst({
        where: { founderId: founder.id, action: 'signed_in' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const seen = [founder.lastLoginAt, lastSignIn?.createdAt].filter((d): d is Date => !!d).map((d) => new Date(d).getTime());
      const facts = await factsFor(founder, seen.length ? new Date(Math.max(...seen)) : null, now);
      const type = pickEngagementEmail(facts, history);
      if (!type) continue;
      run.wouldSend[type] = (run.wouldSend[type] ?? 0) + 1;
      if (!enabled) continue;

      const content = engagementContent(type, facts);
      const separator = content.ctaPath.includes('?') ? '&' : '?';
      const unsubscribeUrl = `${site()}/email-preferences?token=${await unsubscribeToken(founder.id)}`;
      const oneClick = unsubscribeUrl.replace('/email-preferences?', '/api/founder/email-preferences?');
      const result = await sendEmail({
        to: founder.email,
        subject: content.subject,
        html: founderNudgeHtml({
          name: facts.name,
          title: content.title,
          paragraphs: content.paragraphs,
          ctaLabel: content.ctaLabel,
          ctaUrl: `${site()}${content.ctaPath}${separator}utm_source=founder_email&utm_medium=email&utm_campaign=${type}`,
          unsubscribeUrl,
        }),
        type: `founder_${type}`,
        headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      if (!result.success) {
        run.failed += 1;
        continue;
      }
      run.sent += 1;
      await logFounderActivity(founder.id, 'engagement_email', { metadata: { type } });
      // The same nudge in the portal's bell, for whoever misses the email.
      await prisma.founderNotification.create({
        data: { id: randomUUID(), userId: founder.id, type, title: content.title, message: content.paragraphs[0], link: content.ctaPath },
      }).catch(() => { /* the email already went out */ });
    } catch (err) {
      run.failed += 1;
      console.error('[founder-engagement] failed for one founder', err instanceof Error ? err.message : 'unknown error');
    }
  }
  return run;
}
