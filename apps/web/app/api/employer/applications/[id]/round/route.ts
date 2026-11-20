import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { listingScope } from '@/lib/employer/permissions';
import { writeLimited } from '@/lib/employer/write-limit';
import { roundsOf } from '@/lib/employer/rounds';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** Move a candidate in the Interview stage to another of the job's rounds. */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/round');
  if (limited) return limited;
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const b = await request.json().catch(() => ({}));
  const app = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: listingScope(session), withdrawnAt: null },
    select: { id: true, status: true, Listing: { select: { interviewRounds: true } } },
  });
  if (!app) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  if (app.status !== 'INTERVIEW') return NextResponse.json({ error: 'Move them to Interview first.' }, { status: 409 });
  const round = typeof b.round === 'string' ? b.round : '';
  if (!roundsOf(app.Listing.interviewRounds).includes(round)) return NextResponse.json({ error: 'Pick one of this job’s rounds.' }, { status: 400 });
  await prisma.jobBoardApplication.update({ where: { id }, data: { interviewRound: round, statusChangedAt: new Date() } });
  return NextResponse.json({ success: true, round });
}
