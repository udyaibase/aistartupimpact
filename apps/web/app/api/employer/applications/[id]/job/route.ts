import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireEmployerPermission, canSeeJob, listingScope } from '@/lib/employer/permissions';
import { writeLimited } from '@/lib/employer/write-limit';
import { matchSkills } from '@/lib/jobs/skills';
import { screenApplication } from '@/lib/jobs/ai-screen';

export const dynamic = 'force-dynamic';

/**
 * Move a general application (sent without a specific role) into one of the company's real jobs, once a fitting
 * role exists. Only general applications can be moved, so a candidate's choice of role is never overridden.
 * The stage, notes and history stay; a team note records who moved it and from where.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/job');
  if (limited) return limited;
  const session = await requireEmployerPermission('candidates.move');
  if (session instanceof NextResponse) return session;
  const { id } = await props.params;

  const b = await request.json().catch(() => ({}));
  const listingId = typeof b.listingId === 'string' ? b.listingId : '';
  if (!listingId) return NextResponse.json({ error: 'Choose a role.' }, { status: 400 });
  if (!canSeeJob(session, listingId)) return NextResponse.json({ error: 'Role not found.' }, { status: 404 });

  const app = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: listingScope(session) },
    select: { id: true, email: true, listingId: true, confirmedSkills: true, withdrawnAt: true, Listing: { select: { isGeneral: true } } },
  });
  if (!app) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  if (!app.Listing.isGeneral) return NextResponse.json({ error: 'Only general applications can be moved to a role.' }, { status: 400 });
  if (app.withdrawnAt) return NextResponse.json({ error: 'This candidate withdrew their application.' }, { status: 409 });

  const target = await prisma.jobBoardListing.findFirst({
    where: { id: listingId, employerId: session.id, deletedAt: null, isGeneral: false, status: { in: ['OPEN', 'PAUSED'] } },
    select: { id: true, title: true, skills: true },
  });
  if (!target) return NextResponse.json({ error: 'That role isn’t open. Choose an open or paused role.' }, { status: 400 });

  const already = await prisma.jobBoardApplication.findFirst({
    where: { listingId: target.id, email: { equals: app.email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (already) return NextResponse.json({ error: `They’ve already applied to ${target.title}.`, existingId: already.id }, { status: 409 });

  const author = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { FounderUser: { select: { name: true } } } });
  const authorName = session.memberName || (!session.memberId && author?.FounderUser?.name) || session.email.split('@')[0];

  try {
    await prisma.$transaction([
      prisma.jobBoardApplication.update({
        where: { id: app.id },
        data: { listingId: target.id, matchedSkills: matchSkills(target.skills, app.confirmedSkills) },
      }),
      prisma.jobBoardListing.update({ where: { id: app.listingId }, data: { applicationsCount: { decrement: 1 } } }),
      prisma.jobBoardListing.update({ where: { id: target.id }, data: { applicationsCount: { increment: 1 } } }),
      prisma.jobBoardApplicationNote.create({
        data: { applicationId: app.id, authorEmail: session.email, authorName, body: `Moved from General applications to ${target.title}.` },
      }),
    ]);
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: `They’ve already applied to ${target.title}.` }, { status: 409 });
    throw err;
  }

  // Now there's a role to compare against: review it like any new application (uses the plan's AI quota if auto-review is on).
  after(() => screenApplication(app.id, session.id, { auto: true }).then(() => undefined).catch(() => undefined));

  return NextResponse.json({ ok: true, job: { id: target.id, title: target.title } });
}
