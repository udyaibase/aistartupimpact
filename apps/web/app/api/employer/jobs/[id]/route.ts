import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { setListingStatus } from '@/lib/jobs/listing-status';
import { draftFromRow, draftToData, publishProblems, type JobDraft } from '@/lib/jobs/composer';
import { uniqueJobSlug } from '@/lib/jobs/slug';
import { can, forbidden, canSeeJob } from '@/lib/employer/permissions';
import { refreshPaths, refreshSections } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

async function ownJob(id: string, employerId: string) {
  return prisma.jobBoardListing.findFirst({ where: { id, employerId, deletedAt: null } });
}

// GET: A job as composer form state, plus its status
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role, 'jobs.view')) return forbidden();

  const job = canSeeJob(session, id) ? await ownJob(id, session.id) : null;
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  return NextResponse.json({
    job: {
      id: job.id, slug: job.slug, status: job.status, publishedAt: job.publishedAt,
      draftSavedAt: job.draftSavedAt, updatedAt: job.updatedAt, applicationsCount: job.applicationsCount,
    },
    draft: draftFromRow(job),
  });
}

/**
 * PUT: Save the composer. Drafts accept half-finished input (autosave); a live job must stay
 * publishable, so edits that would break it are rejected with the field to fix.
 */
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
    if (!can(session.role, 'jobs.manage')) return forbidden();

    const job = await ownJob(id, session.id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));

    // Legacy deactivate toggle; publishing goes through /status so the publish checks apply.
    if (body.isActive === false && !body.draft) {
      await setListingStatus(id, 'PAUSED');
      return NextResponse.json({ success: true });
    }

    const draft = { ...draftFromRow(job), ...(body.draft as Partial<JobDraft>) };
    const data = draftToData(draft);
    if (!data.title) return NextResponse.json({ error: 'Add a job title.', field: 'title' }, { status: 400 });

    if (job.status === 'OPEN' || job.status === 'PAUSED') {
      const problems = publishProblems(draftFromRow({ ...job, ...data }));
      if (problems.length) {
        return NextResponse.json({ error: problems[0].message, field: problems[0].field, problems }, { status: 400 });
      }
    }

    // A never-published draft follows its title; live URLs never change.
    const slug = !job.publishedAt && data.title !== job.title ? await uniqueJobSlug(data.title, id) : job.slug;

    const saved = await prisma.jobBoardListing.update({
      where: { id },
      data: { ...data, slug, ...(job.status === 'DRAFT' ? { draftSavedAt: new Date() } : {}) },
      select: { id: true, slug: true, status: true, draftSavedAt: true, updatedAt: true },
    });

    if (job.status !== 'DRAFT') {
      refreshSections(['jobs', 'home']);
      refreshPaths([`/jobs/${job.slug}`]);
    }
    return NextResponse.json({ success: true, job: saved });
  } catch (error) {
    console.error('[PUT /api/employer/jobs/[id]]', error);
    return NextResponse.json({ error: 'Couldn’t save. Check your connection and try again.' }, { status: 500 });
  }
}

// DELETE: Soft-delete a job
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role, 'jobs.manage')) return forbidden();

  const job = await ownJob(id, session.id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  await setListingStatus(id, 'CLOSED', 'MANUAL');
  await prisma.jobBoardListing.update({ where: { id }, data: { deletedAt: new Date() } });
  refreshSections(['jobs', 'home']);
  return NextResponse.json({ success: true });
}
