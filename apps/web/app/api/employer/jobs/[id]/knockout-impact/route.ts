import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi } from '@/lib/employer/api-session';
import { canSeeJob } from '@/lib/employer/permissions';
import { draftToData } from '@/lib/jobs/composer';
import { evaluateKnockouts } from '@/lib/jobs/knockouts';

export const dynamic = 'force-dynamic';

/**
 * Before an employer saves changed screening questions on a job with applicants: how many open candidates would
 * newly not meet the knockouts, and how many would newly meet them. Nothing is saved here.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('jobs.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  if (!canSeeJob(session, id)) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  const listing = await prisma.jobBoardListing.findFirst({ where: { id, employerId: session.id }, select: { screeningQuestions: true } });
  if (!listing) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const next = draftToData({ screeningQuestions: Array.isArray(body.screeningQuestions) ? body.screeningQuestions : [] }).screeningQuestions;
  const apps = await prisma.jobBoardApplication.findMany({
    where: { listingId: id, withdrawnAt: null, status: { notIn: ['REJECTED', 'HIRED'] }, sourcedState: null },
    select: { screeningAnswers: true },
    take: 5000,
  });
  let nowFail = 0, nowPass = 0;
  for (const a of apps) {
    const before = evaluateKnockouts(listing.screeningQuestions, a.screeningAnswers).knockedOut;
    const after = evaluateKnockouts(next, a.screeningAnswers).knockedOut;
    if (!before && after) nowFail++;
    if (before && !after) nowPass++;
  }
  return NextResponse.json({ nowFail, nowPass, checked: apps.length }, { headers: { 'Cache-Control': 'private, no-store' } });
}
