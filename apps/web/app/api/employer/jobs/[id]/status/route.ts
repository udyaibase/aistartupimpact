import { NextRequest, NextResponse, after } from 'next/server';
import { notifyEmployer } from '@/lib/employer/notify';
import { prisma } from '@udyaibase/database';
import { ownerInboxes, sendApprovalDeclinedEmail, sendApprovalRequestEmail } from '@/lib/employer/team';
import { setListingStatus } from '@/lib/jobs/listing-status';
import { canPublish } from '@/lib/jobs/trust';
import { draftFromRow, publishProblems } from '@/lib/jobs/composer';
import { can, forbidden } from '@/lib/employer/permissions';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerActor, logEmployerActivity } from '@/lib/workspace-activity';
import { markWaiting, publishNow, PUBLISH_EMPLOYER_SELECT, readyToPublish, refreshPublished } from '@/lib/employer/publish';
import { requestCompanyReview } from '@/lib/employer/company-check';
import { markStep } from '@/lib/employer/onboarding';
import { closingPreview, notifyClosedJob } from '@/lib/employer/closing';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

const RENEW_DAYS = 30;
/** Renewing can't push a closing date further out than this, so stale roles still close. */
const MAX_OPEN_DAYS = 90;
const ACTIONS = ['publish', 'resume', 'pause', 'close', 'renew', 'decline'] as const;
type Action = (typeof ACTIONS)[number];

/** Before closing: how many waiting candidates would get the "role closed" email, and how many are mid-process. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('jobs.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  const listing = await prisma.jobBoardListing.findFirst({ where: { id, employerId: session.id, deletedAt: null }, select: { id: true } });
  if (!listing) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  return NextResponse.json(await closingPreview(id));
}

/**
 * Publish, pause, resume, close (filled or not) or renew (+30 days) one of the employer's jobs.
 * Approval mode (owner setting): a recruiter's first publish becomes a request to owners instead;
 * owners publish it, or `decline` sends it back with a note.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'jobs/[id]/status');
  if (limited) return limited;
  const { id } = await props.params;
  const guard = await employerApi('jobs.manage');
  if (guard.error) return guard.error;
  const session = guard.session;

  const body = await request.json().catch(() => ({}));
  const action = body.action as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const [listing, employer] = await Promise.all([
    prisma.jobBoardListing.findFirst({
      where: { id, employerId: session.id, deletedAt: null },
    }),
    prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: PUBLISH_EMPLOYER_SELECT,
    }),
  ]);
  if (!listing || !employer) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  if (listing.isGeneral) return NextResponse.json({ error: 'General applications are turned on or off in Website widget settings.' }, { status: 400 });

  const now = new Date();

  if (action === 'decline') {
    if (!can(session.role, 'company.manage')) return forbidden();
    if (!listing.approvalRequestedAt) return NextResponse.json({ error: 'Nobody asked to publish this job.' }, { status: 400 });
    await prisma.jobBoardListing.update({ where: { id }, data: { approvalRequestedAt: null, approvalRequestedBy: null } });
    if (listing.approvalRequestedBy) {
      sendApprovalDeclinedEmail({ to: listing.approvalRequestedBy, who: session.memberName || session.email, jobTitle: listing.title, jobId: id, note: String(body.note ?? '').trim().slice(0, 500) });
      await notifyEmployer(session.id, {
        type: 'job_approval_declined', title: `“${listing.title}” wasn’t published yet`,
        message: String(body.note ?? '').trim().slice(0, 300) || `${session.memberName || session.email} asked for changes first.`, link: `/employer/jobs/${id}/edit`,
      }, { email: listing.approvalRequestedBy });
    }
    return NextResponse.json({ success: true, status: listing.status, approval: null });
  }

  const willOpen = action === 'publish' || action === 'resume' || (action === 'renew' && listing.status === 'CLOSED');

  // Approval mode: a recruiter's first publish of a job goes to the owners instead (checked again below).
  const needsOwner = action === 'publish' && !listing.publishedAt && employer.requireJobApproval && session.role === 'RECRUITER';

  if (willOpen && listing.status !== 'OPEN') {
    const gate = canPublish(employer, session.email);
    if (!gate.ok) {
      const waits = gate.code === 'review_needed' || gate.code === 'review_pending' || gate.code === 'startup_unverified';
      if (needsOwner) {
        // Owners decide; when they press Publish the job waits for the company in the usual way.
      } else if (waits && action === 'publish') {
        // The job must be complete before it waits, so it can go live the moment the company is cleared.
        const problems = publishProblems(draftFromRow(listing));
        if (problems.length) return NextResponse.json({ error: problems[0].message, field: problems[0].field, problems }, { status: 400 });
        await markWaiting(id, session.email, now);
        await markStep(session.id, 'PUBLISH_BLOCKED', { code: gate.code });
        if (gate.code === 'review_needed') await requestCompanyReview(session.id, session.email, now);
        return NextResponse.json({ success: true, status: listing.status, waiting: gate.code === 'startup_unverified' ? 'founder' : 'review', message: gate.reason }, { status: 202 });
      } else {
        return NextResponse.json({ error: gate.reason, code: gate.code }, { status: 403 });
      }
    } else {
      const ready = await readyToPublish(session.id, listing, employer, gate);
      if (!ready.ok) {
        const { ok: _ok, status, ...body } = ready;
        // Only someone who manages the account can change the plan; teammates are told to ask an owner.
        return NextResponse.json(body.upgradeTo ? { ...body, canUpgrade: can(session.role, 'account.manage') } : body, { status });
      }
    }
  }

  // Approval mode: a recruiter can't put a new job live; owners are asked instead. Jobs that were
  // already published (approved) can still be paused, resumed and renewed.
  if (needsOwner) {
    const already = !!listing.approvalRequestedAt;
    await prisma.jobBoardListing.update({ where: { id }, data: { approvalRequestedAt: now, approvalRequestedBy: session.email } });
    if (!already) {
      const who = session.memberName || session.email;
      for (const to of await ownerInboxes(session.id)) sendApprovalRequestEmail({ to, who, jobTitle: listing.title, jobId: id });
      await notifyEmployer(session.id, { type: 'job_approval_request', title: `${who} wants to publish “${listing.title}”`, message: 'Review the job and publish it, or ask for changes.', link: `/employer/jobs/${id}/edit` }, 'owners');
    }
    return NextResponse.json({ success: true, status: listing.status, approval: 'requested' }, { status: 202 });
  }

  switch (action) {
    case 'publish':
    case 'resume':
      await publishNow({ employerId: session.id, listing, employer, actor: { email: session.email, name: session.memberName ?? null, memberId: session.memberId ?? null }, now });
      break;
    case 'pause':
      if (listing.status !== 'OPEN') return NextResponse.json({ error: 'Only open jobs can be paused.' }, { status: 400 });
      await setListingStatus(id, 'PAUSED');
      break;
    case 'close':
      await setListingStatus(id, 'CLOSED', body.reason === 'FILLED' ? 'FILLED' : 'MANUAL');
      // Everyone still waiting hears back (default on; the confirm step shows how many).
      if (body.notifyCandidates !== false) after(() => notifyClosedJob(id, session.email).then(() => undefined).catch((e) => console.error('[jobs] closing emails', id, e instanceof Error ? e.message : e)));
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

  refreshPublished(listing.slug, employer.Startup?.slug ?? null);

  const updated = await prisma.jobBoardListing.findUnique({ where: { id }, select: { status: true, expiresAt: true } });
  if (action !== 'renew') {
    await logEmployerActivity(session.id, action === 'publish' && !listing.publishedAt ? 'job_posted' : 'job_status_changed', {
      actor: employerActor(session), request, metadata: { title: listing.title, status: updated?.status ?? '' },
    });
  }
  return NextResponse.json({ success: true, status: updated?.status, expiresAt: updated?.expiresAt });
}
