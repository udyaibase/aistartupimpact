import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { can, listingScope } from '@/lib/employer/permissions';
import { writeLimited } from '@/lib/employer/write-limit';
import { cleanScorecard, loadScorecards } from '@/lib/employer/scorecards';
import { roundsOf, scorecardSkills } from '@/lib/employer/rounds';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

async function ownApp(id: string, session: { id: string; jobIds: string[] | null }) {
  return prisma.jobBoardApplication.findFirst({
    where: { id, Listing: listingScope(session), NOT: { email: { endsWith: '@deleted.invalid' } } },
    select: { id: true, Listing: { select: { interviewRounds: true, skills: true, mustHaveSkills: true } } },
  });
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  const session = guard.session;
  if (!(await ownApp(id, session))) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  return NextResponse.json(await loadScorecards(id, { email: session.email, role: session.role }));
}

/** Save (or update) your own scorecard for one round. Interviewers can score the candidates of jobs they're on. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/scorecards');
  if (limited) return limited;
  const { id } = await props.params;
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  const session = guard.session;
  const app = await ownApp(id, session);
  if (!app) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  const card = cleanScorecard(await request.json().catch(() => ({})), roundsOf(app.Listing.interviewRounds), scorecardSkills(app.Listing));
  if (!card.ok) return NextResponse.json({ error: card.error }, { status: 400 });
  const authorEmail = session.email.toLowerCase();
  await prisma.jobBoardScorecard.upsert({
    where: { applicationId_round_authorEmail: { applicationId: id, round: card.round, authorEmail } },
    create: { applicationId: id, round: card.round, authorEmail, authorName: session.memberName || session.email.split('@')[0], ratings: card.ratings, recommendation: card.recommendation, notes: card.notes },
    update: { ratings: card.ratings, recommendation: card.recommendation, notes: card.notes },
  });
  return NextResponse.json(await loadScorecards(id, { email: session.email, role: session.role }));
}
