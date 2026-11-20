import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** The signed-in person's own email settings (today: the Monday hiring report). Owners and recruiters only. */
export async function GET() {
  const guard = await employerApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  if (session.role === 'INTERVIEWER') return NextResponse.json({ weeklyReport: false, available: false });
  const on = session.memberId
    ? (await prisma.jobBoardTeamMember.findFirst({ where: { id: session.memberId, employerId: session.id }, select: { weeklyReport: true } }))?.weeklyReport
    : (await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { weeklyReport: true } }))?.weeklyReport;
  return NextResponse.json({ weeklyReport: on ?? false, available: true });
}

export async function PATCH(request: NextRequest) {
  const limited = await writeLimited(request, 'notifications');
  if (limited) return limited;
  const guard = await employerApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  if (session.role === 'INTERVIEWER') return NextResponse.json({ error: 'The weekly report is for owners and recruiters.' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  if (typeof b.weeklyReport !== 'boolean') return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  if (session.memberId) {
    await prisma.jobBoardTeamMember.updateMany({ where: { id: session.memberId, employerId: session.id }, data: { weeklyReport: b.weeklyReport } });
  } else {
    await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { weeklyReport: b.weeklyReport } });
  }
  return NextResponse.json({ success: true, weeklyReport: b.weeklyReport });
}
