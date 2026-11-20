import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { listingScope } from '@/lib/employer/permissions';
import { writeLimited } from '@/lib/employer/write-limit';
import { cancelInterview, listInterviews, scheduleInterview } from '@/lib/employer/interviews';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  const session = guard.session;
  const app = await prisma.jobBoardApplication.findFirst({ where: { id, Listing: listingScope(session) }, select: { id: true } });
  if (!app) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  const [interviews, team] = await Promise.all([
    listInterviews(id),
    prisma.jobBoardTeamMember.findMany({ where: { employerId: session.id, status: 'ACTIVE' }, select: { email: true, name: true } }),
  ]);
  return NextResponse.json({ interviews, team: team.map((t) => ({ email: t.email, name: t.name || t.email.split('@')[0] })) });
}

/** Schedule an interview (an email with a calendar file to the candidate and panel). */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/interviews');
  if (limited) return limited;
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const input = await request.json().catch(() => ({}));
  const r = await scheduleInterview({
    employerId: session.id, applicationId: id, jobIds: session.jobIds, input,
    actor: { email: session.email, name: session.memberName || session.email.split('@')[0] },
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, ...r });
}

/** Cancel one interview (?interview=<id>); the candidate is told. */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/interviews');
  if (limited) return limited;
  await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const ok = await cancelInterview({ employerId: session.id, interviewId: request.nextUrl.searchParams.get('interview') ?? '', actorEmail: session.email, jobIds: session.jobIds });
  return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Interview not found.' }, { status: 404 });
}
