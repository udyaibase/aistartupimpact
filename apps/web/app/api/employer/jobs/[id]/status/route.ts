import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { effectivePlan, PLANS } from '@/lib/employer/plans';
import { featuredFor } from '@/lib/employer/billing';
import { ownerInboxes, sendApprovalDeclinedEmail, sendApprovalRequestEmail, sendTeammatePublishedEmail } from '@/lib/employer/team';
import { getEmployerSession } from '@/lib/employer-auth';
import { setListingStatus } from '@/lib/jobs/listing-status';
import { canPublish } from '@/lib/jobs/trust';
import { draftFromRow, publishProblems } from '@/lib/jobs/composer';
import { can, forbidden } from '@/lib/employer/permissions';
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { maybeStartTrial } from '@/lib/employer/trial';

export const dynamic = 'force-dynamic';

const RENEW_DAYS = 30;
/** Renewing can't push a closing date further out than this, so stale roles still close. */
const MAX_OPEN_DAYS = 90;
const ACTIONS = ['publish', 'resume', 'pause', 'close', 'renew', 'decline'] as const;
type Action = (typeof ACTIONS)[number];

/**
 * Publish, pause, resume, close (filled or not) or renew (+30 days) one of the employer's jobs.
 * Approval mode (owner setting): a recruiter's first publish becomes a request to owners instead;
 * owners publish it, or `decline` sends it back with a note.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'jobs.manage')) return forbidden();

  const body = await request.json().catch(() => ({}));
  const action = body.action as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const [listing, employer] = await Promise.all([
    prisma.jobBoardListing.findFirst({
      where: { id, employerId: session.id, deletedAt: null },
    }),
    prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { email: true, passwordHash: true, requireJobApproval: true, emailVerified: true, maxActiveJobs: true, plan: true, planExpiresAt: true, firstJobPublishedAt: true, startupId: true, startupClaimMethod: true },
    }),
  ]);
  if (!listing || !employer) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  const now = new Date();

  if (action === 'decline') {
    if (!can(session.role, 'company.manage')) return forbidden();
    if (!listing.approvalRequestedAt) return NextResponse.json({ error: 'Nobody asked to publish this job.' }, { status: 400 });
    await prisma.jobBoardListing.update({ where: { id }, data: { approvalRequestedAt: null, approvalRequestedBy: null } });
    if (listing.approvalRequestedBy) {
      sendApprovalDeclinedEmail({ to: listing.approvalRequestedBy, who: session.memberName || session.email, jobTitle: listing.title, jobId: id, note: String(body.note ?? '').trim().slice(0, 500) });
    }
    return NextResponse.json({ success: true, status: listing.status, approval: null });
  }

  const willOpen = action === 'publish' || action === 'resume' || (action === 'renew' && listing.status === 'CLOSED');

  if (willOpen && listing.status !== 'OPEN') {
    const gate = canPublish(employer);
    if (!gate.ok) return NextResponse.json({ error: gate.reason, code: gate.code }, { status: 403 });
    const problems = publishProblems(draftFromRow(listing));
    if (problems.length) {
      return NextResponse.json({ error: problems[0].message, field: problems[0].field, problems }, { status: 400 });
    }
    const open = await prisma.jobBoardListing.count({ where: { employerId: session.id, status: 'OPEN', deletedAt: null } });
    const plan = effectivePlan(employer);
    // A lapsed paid plan falls back to Free; otherwise keep any higher limit an admin granted.
    const limit = plan.key === 'FREE' && employer.plan !== 'FREE' ? PLANS.FREE.maxActiveJobs : Math.max(plan.maxActiveJobs, employer.maxActiveJobs);
    if (open >= limit) {
      return NextResponse.json(
        { error: `You can have ${limit} open job${limit === 1 ? '' : 's'} on the ${plan.name} plan. Close or pause one first, or upgrade for more.`, code: 'limit' },
        { status: 403 },
      );
    }
  }

  // Approval mode: a recruiter can't put a new job live; owners are asked instead. Jobs that were
  // already published (approved) can still be paused, resumed and renewed.
  if (action === 'publish' && !listing.publishedAt && employer.requireJobApproval && session.role === 'RECRUITER') {
    const already = !!listing.approvalRequestedAt;
    await prisma.jobBoardListing.update({ where: { id }, data: { approvalRequestedAt: now, approvalRequestedBy: session.email } });
    if (!already) {
      const who = session.memberName || session.email;
      for (const to of await ownerInboxes(session.id)) sendApprovalRequestEmail({ to, who, jobTitle: listing.title, jobId: id });
    }
    return NextResponse.json({ success: true, status: listing.status, approval: 'requested' }, { status: 202 });
  }

  switch (action) {
    case 'publish':
    case 'resume': {
      // A job whose closing date has passed gets a fresh window rather than reopening already expired.
      if (!listing.expiresAt || listing.expiresAt <= now) {
        await prisma.jobBoardListing.update({ where: { id }, data: { expiresAt: new Date(now.getTime() + RENEW_DAYS * 86_400_000), expiryNudgeAt: null } });
      }
      await setListingStatus(id, 'OPEN');
      // A workspace's first published job starts its free Pro trial (before featuredFor, so it's featured too).
      if (!employer.firstJobPublishedAt) await maybeStartTrial(session.id);
      const firstPublish = !listing.publishedAt;
      await prisma.jobBoardListing.update({
        where: { id },
        data: { ...(await featuredFor(session.id)), approvalRequestedAt: null, approvalRequestedBy: null, ...(firstPublish ? { publishedByEmail: session.email, publishedByName: session.memberName } : {}) },
      });
      // A teammate published under the startup's name: tell the owner straight away (placeholder workspaces have no inbox).
      if (firstPublish && session.memberId && employer.passwordHash !== '') {
        sendTeammatePublishedEmail({ to: employer.email, who: session.memberName || session.email, jobTitle: listing.title, slug: listing.slug, jobId: id });
      }
      if (!employer.firstJobPublishedAt) {
        await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { firstJobPublishedAt: now } });
      }
      break;
    }
    case 'pause':
      if (listing.status !== 'OPEN') return NextResponse.json({ error: 'Only open jobs can be paused.' }, { status: 400 });
      await setListingStatus(id, 'PAUSED');
      break;
    case 'close':
      await setListingStatus(id, 'CLOSED', body.reason === 'FILLED' ? 'FILLED' : 'MANUAL');
      break;
    case 'renew': {
      const from = listing.expiresAt && listing.expiresAt > now ? listing.expiresAt : now;
      const cap = now.getTime() + MAX_OPEN_DAYS * 86_400_000;
      if (from.getTime() + RENEW_DAYS * 86_400_000 > cap) {
        return NextResponse.json({ error: `This job already stays open until ${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Renew it closer to the date.` }, { status: 400 });
      }
      await prisma.jobBoardListing.update({ where: { id }, data: { expiresAt: new Date(from.getTime() + RENEW_DAYS * 86_400_000), expiryNudgeAt: null } });
      if (listing.status === 'CLOSED') await setListingStatus(id, 'OPEN');
      break;
    }
  }

  // Job lists, the homepage's latest jobs, this job, and the startup profile that lists it.
  refreshSections(['jobs', 'home']);
  refreshPaths([`/jobs/${listing.slug}`]);
  if (employer.startupId) {
    const s = await prisma.startup.findUnique({ where: { id: employer.startupId }, select: { slug: true } });
    if (s) refreshPaths([`/startups/${s.slug}`]);
  }

  const updated = await prisma.jobBoardListing.findUnique({ where: { id }, select: { status: true, expiresAt: true } });
  return NextResponse.json({ success: true, status: updated?.status, expiresAt: updated?.expiresAt });
}
