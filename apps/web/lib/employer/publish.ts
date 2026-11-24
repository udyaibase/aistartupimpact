import { recordUnknownSkills } from '@/lib/jobs/skill-overrides';
import { after } from 'next/server';
import { prisma } from '@udyaibase/database';
import { effectivePlan, PLANS } from '@/lib/employer/plans';
import { featuredFor } from '@/lib/employer/billing';
import { sendTeammatePublishedEmail } from '@/lib/employer/team';
import { maybeStartTrial } from '@/lib/employer/trial';
import { markStep } from '@/lib/employer/onboarding';
import { setListingStatus } from '@/lib/jobs/listing-status';
import { canPublish, type PublishGate } from '@/lib/jobs/trust';
import { draftFromRow, publishProblems } from '@/lib/jobs/composer';
import { standardJobLocation } from '@/lib/jobs/location';
import { notifyCareersSubscribers } from '@/lib/jobs/careers-subscribers';
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';

/**
 * Putting a job live, shared by the Publish button and by jobs that were waiting for the company to be cleared
 * (the founder verified the startup, or the admin company check passed).
 */

const RENEW_DAYS = 30;
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

/** Employer fields the gate and publishing need. */
export const PUBLISH_EMPLOYER_SELECT = {
  email: true, passwordHash: true, requireJobApproval: true, emailVerified: true, isVerified: true, maxActiveJobs: true, plan: true, planExpiresAt: true,
  firstJobPublishedAt: true, startupId: true, startupClaimMethod: true, websiteUrl: true, companyName: true,
  companyReview: true, companyReviewNote: true, Startup: { select: { isVerified: true, slug: true } },
} as const;

type PublishEmployer = {
  email: string; passwordHash: string; maxActiveJobs: number; plan: string; planExpiresAt: Date | null; firstJobPublishedAt: Date | null;
  startupId: string | null; Startup?: { slug: string } | null;
};

type ListingRow = Parameters<typeof draftFromRow>[0] & {
  id: string; slug: string; title: string; publishedAt: Date | null; expiresAt: Date | null; workType: string; city: string | null; country: string | null;
  showOnCareers: boolean; showOnProfile: boolean;
};

/** Run after the response when inside a request; otherwise straight away. */
function later(fn: () => Promise<unknown>) {
  const run = () => fn().then(() => undefined).catch((e) => console.error('[publish] background task failed', e instanceof Error ? e.message : e));
  try { after(run); } catch { void run(); }
}

/**
 * Checks a job can go live now: required fields, a listed place, and the plan's live-job limit (2 for workspaces
 * that passed only the company check). Fixes an old free-text city to the standard one on the way.
 */
export async function readyToPublish(employerId: string, listing: ListingRow, employer: PublishEmployer & { maxActiveJobs: number }, gate: Extract<PublishGate, { ok: true }>):
  Promise<{ ok: true } | { ok: false; status: number; error: string; field?: string; problems?: unknown; code?: string }> {
  const problems = publishProblems(draftFromRow(listing));
  if (problems.length) return { ok: false, status: 400, error: problems[0].message, field: problems[0].field, problems };
  const loc = await standardJobLocation({ workType: listing.workType, city: listing.city, country: listing.country });
  if (!loc.ok) return { ok: false, status: 400, error: `${loc.error} Open the job to fix it.`, field: loc.field };
  if (loc.data.city !== listing.city || loc.data.country !== listing.country) {
    await prisma.jobBoardListing.update({ where: { id: listing.id }, data: { city: loc.data.city, country: loc.data.country, location: loc.data.location } });
  }
  const open = await prisma.jobBoardListing.count({ where: { employerId, status: 'OPEN', deletedAt: null } });
  const plan = effectivePlan(employer);
  // A lapsed paid plan falls back to Free; otherwise keep any higher limit an admin granted.
  const planLimit = plan.key === 'FREE' && employer.plan !== 'FREE' ? PLANS.FREE.maxActiveJobs : Math.max(plan.maxActiveJobs, employer.maxActiveJobs);
  if (gate.tier === 'reviewed' && open >= gate.maxLive && gate.maxLive <= planLimit) {
    return { ok: false, status: 403, code: 'limit', error: `You can have ${gate.maxLive} live jobs until your founder verifies the startup on Udyaibase. Close or pause one first, or ask your founder to verify.` };
  }
  if (open >= planLimit) {
    return { ok: false, status: 403, code: 'limit', error: `You can have ${planLimit} open job${planLimit === 1 ? '' : 's'} on the ${plan.name} plan. Close or pause one first, or upgrade for more.` };
  }
  return { ok: true };
}

/** Puts the job live (first publish or a resume) and does everything that follows. */
export async function publishNow(opts: {
  employerId: string; listing: ListingRow; employer: PublishEmployer; actor: { email: string; name: string | null; memberId: string | null }; now?: Date;
}) {
  const { employerId, listing, employer, actor } = opts;
  const now = opts.now ?? new Date();
  // A job whose closing date has passed gets a fresh window rather than reopening already expired.
  if (!listing.expiresAt || listing.expiresAt <= now) {
    await prisma.jobBoardListing.update({ where: { id: listing.id }, data: { expiresAt: new Date(now.getTime() + RENEW_DAYS * 86_400_000), expiryNudgeAt: null } });
  }
  await setListingStatus(listing.id, 'OPEN');
  // A workspace's first published job starts its free Pro trial (before featuredFor, so it's featured too).
  if (!employer.firstJobPublishedAt) await maybeStartTrial(employerId);
  const firstPublish = !listing.publishedAt;
  await prisma.jobBoardListing.update({
    where: { id: listing.id },
    data: {
      ...(await featuredFor(employerId)), approvalRequestedAt: null, approvalRequestedBy: null, publishWaitingAt: null, publishWaitingBy: null,
      ...(firstPublish ? { publishedByEmail: actor.email, publishedByName: actor.name } : {}),
    },
  });
  // A teammate published under the startup's name: tell the owner straight away (placeholder workspaces have no inbox).
  if (firstPublish && actor.memberId && employer.passwordHash !== '' && actor.email.toLowerCase() !== employer.email.toLowerCase()) {
    sendTeammatePublishedEmail({ to: employer.email, who: actor.name || actor.email, jobTitle: listing.title, slug: listing.slug, jobId: listing.id });
  }
  if (!employer.firstJobPublishedAt) {
    await prisma.jobBoardEmployer.update({ where: { id: employerId }, data: { firstJobPublishedAt: now } });
    await markStep(employerId, 'FIRST_JOB_LIVE');
  }
  // People who asked to hear when this company is hiring (only for a role's first publish, not a reopen).
  if (firstPublish && (listing.showOnCareers || listing.showOnProfile)) later(() => notifyCareersSubscribers(employerId, { title: listing.title, slug: listing.slug }));
  // Skills the dictionary doesn't know yet go to the admin review queue (nothing changes until someone approves).
  later(async () => {
    const row = await prisma.jobBoardListing.findUnique({ where: { id: listing.id }, select: { skills: true, mustHaveSkills: true } });
    if (row) await recordUnknownSkills([...row.skills, ...row.mustHaveSkills], 'job');
  });
  refreshPublished(listing.slug, employer.Startup?.slug ?? null);
}

/** Job lists, the homepage's latest jobs, this job, and the startup profile that lists it. */
export function refreshPublished(slug: string, startupSlug: string | null) {
  refreshSections(['jobs', 'home']);
  refreshPaths([`/jobs/${slug}`, ...(startupSlug ? [`/startups/${startupSlug}`] : [])]);
}

/** Marks a job as waiting to go live once the company is cleared (the Publish button was pressed). */
export async function markWaiting(listingId: string, by: string, now = new Date()) {
  await prisma.jobBoardListing.updateMany({ where: { id: listingId, status: 'DRAFT', publishWaitingAt: null }, data: { publishWaitingAt: now, publishWaitingBy: by } });
}

/**
 * The company was just cleared (founder verified, or the admin check passed): publish the jobs waiting for it, oldest
 * first, as far as the live-job limit allows. Jobs that can't go (limit, missing fields) stay drafts and stop waiting.
 * Whoever pressed Publish is told by email.
 */
export async function publishWaiting(employerId: string, now = new Date()): Promise<{ published: string[]; skipped: string[] }> {
  const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: PUBLISH_EMPLOYER_SELECT });
  const result = { published: [] as string[], skipped: [] as string[] };
  if (!employer) return result;
  const gate = canPublish(employer);
  const waiting = await prisma.jobBoardListing.findMany({
    where: { employerId, deletedAt: null, status: 'DRAFT', publishWaitingAt: { not: null }, isGeneral: false },
    orderBy: { publishWaitingAt: 'asc' },
    take: 20,
  });
  if (!waiting.length || !gate.ok) return result;

  const byPerson = new Map<string, { live: string[]; draft: string[] }>();
  for (const listing of waiting) {
    const by = listing.publishWaitingBy || employer.email;
    const entry = byPerson.get(by) ?? { live: [], draft: [] };
    byPerson.set(by, entry);
    // Re-read each time: the first publish starts the free trial, which raises the live-job limit.
    const current = (await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: PUBLISH_EMPLOYER_SELECT })) ?? employer;
    const ready = await readyToPublish(employerId, listing, current, gate);
    if (!ready.ok) {
      await prisma.jobBoardListing.update({ where: { id: listing.id }, data: { publishWaitingAt: null, publishWaitingBy: null } });
      result.skipped.push(listing.id);
      entry.draft.push(listing.title);
      continue;
    }
    const member = listing.publishWaitingBy
      ? await prisma.jobBoardTeamMember.findFirst({ where: { employerId, email: listing.publishWaitingBy, status: 'ACTIVE' }, select: { id: true, name: true } })
      : null;
    await publishNow({ employerId, listing, employer: current, actor: { email: by, name: member?.name ?? null, memberId: member?.id ?? null }, now });
    result.published.push(listing.id);
    entry.live.push(listing.title);
  }

  for (const [to, { live, draft }] of byPerson) {
    if (!/@/.test(to) || to.endsWith('.invalid')) continue;
    const list = (xs: string[]) => xs.map((t) => `<li>${esc(t)}</li>`).join('');
    sendEmailFireAndForget({
      to, type: 'employer_jobs_released',
      subject: live.length ? `Your job${live.length > 1 ? 's are' : ' is'} live on Udyaibase` : 'Your jobs are ready to publish',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">${live.length ? 'Good news: your company is cleared' : 'Your company is cleared'}</h1>
${live.length ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">These jobs are now live and open for applications:</p><ul style="margin:0 0 16px;font-size:15px;line-height:1.6">${list(live)}</ul>` : ''}
${draft.length ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">These are still drafts (live-job limit or something to fix). Open them to publish:</p><ul style="margin:0 0 16px;font-size:15px;line-height:1.6">${list(draft)}</ul>` : ''}
<p style="margin:0">${button(`${SITE()}/employer/jobs`, 'Open your jobs')}</p>`),
    });
  }
  return result;
}
