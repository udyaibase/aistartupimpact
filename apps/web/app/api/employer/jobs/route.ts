import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { draftFromRow, draftToData, defaultClosesOn, type JobDraft } from '@/lib/jobs/composer';
import { uniqueJobSlug } from '@/lib/jobs/slug';
import { can, forbidden, listingScope } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

const MAX_DRAFTS = 50;

// GET: List the employer's own jobs
export async function GET() {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role, 'jobs.view')) return forbidden();

  const jobs = await prisma.jobBoardListing.findMany({
    where: { ...listingScope(session), deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, slug: true, title: true, status: true, workType: true, location: true,
      applicationsCount: true, viewsCount: true, publishedAt: true, createdAt: true, expiresAt: true, closeReason: true,
    },
  });
  return NextResponse.json({ jobs });
}

/**
 * POST: Create a draft. The composer calls this only once the title is non-empty,
 * so abandoned blank forms never create rows. `{ duplicateOf }` copies an existing job.
 * Publishing is a separate step: POST /api/employer/jobs/[id]/status { action: 'publish' }.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
    if (!can(session.role, 'jobs.manage')) return forbidden();

    const body = await request.json().catch(() => ({}));

    const drafts = await prisma.jobBoardListing.count({ where: { employerId: session.id, status: 'DRAFT', deletedAt: null } });
    if (drafts >= MAX_DRAFTS) {
      return NextResponse.json({ error: `You have ${MAX_DRAFTS} drafts. Delete some before starting another.` }, { status: 403 });
    }

    let draft: Partial<JobDraft>;
    if (body.duplicateOf) {
      const source = await prisma.jobBoardListing.findFirst({ where: { id: String(body.duplicateOf), employerId: session.id, deletedAt: null } });
      if (!source) return NextResponse.json({ error: 'Job to copy not found.' }, { status: 404 });
      draft = { ...draftFromRow(source), title: `${source.title} (copy)`, closesOn: defaultClosesOn() };
    } else {
      draft = (body.draft ?? body) as Partial<JobDraft>;
    }

    const data = draftToData(draft);
    if (!data.title) return NextResponse.json({ error: 'Add a job title first.', field: 'title' }, { status: 400 });

    const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { startupId: true } });
    const job = await prisma.jobBoardListing.create({
      data: {
        ...data,
        slug: await uniqueJobSlug(data.title),
        employerId: session.id,
        startupId: employer?.startupId ?? null,
        status: 'DRAFT',
        isActive: false,
        draftSavedAt: new Date(),
      },
      select: { id: true, slug: true, title: true, status: true, draftSavedAt: true },
    });

    return NextResponse.json({ success: true, job }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/employer/jobs]', error);
    return NextResponse.json({ error: 'Couldn’t save the job. Try again.' }, { status: 500 });
  }
}
