import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession, type EmployerRole } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { INVITE_TTL_DAYS, cleanJobIds, hashToken, listTeam, newInviteToken, sendInviteEmail } from '@/lib/employer/team';

export const dynamic = 'force-dynamic';

const ROLES: EmployerRole[] = ['OWNER', 'RECRUITER', 'INTERVIEWER'];

async function own(memberId: string, employerId: string) {
  return prisma.jobBoardTeamMember.findFirst({ where: { id: memberId, employerId, status: { in: ['PENDING', 'ACTIVE'] } } });
}

/** Change a teammate's role or an interviewer's jobs ({ jobIds }), or resend their invite ({ action: 'resend' }). Owners only. */
export async function PATCH(request: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'team.manage')) return forbidden();
  const member = await own(memberId, session.id);
  if (!member) return NextResponse.json({ error: 'Teammate not found.' }, { status: 404 });
  const b = await request.json().catch(() => ({}));

  if (b.action === 'resend') {
    if (member.status !== 'PENDING') return NextResponse.json({ error: 'They’ve already joined.' }, { status: 400 });
    const token = newInviteToken();
    await prisma.jobBoardTeamMember.update({ where: { id: member.id }, data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000), invitedAt: new Date() } });
    const sent = await sendInviteEmail({ employerId: session.id, to: member.email, role: member.role, inviterEmail: session.email, inviterName: session.memberName, token });
    if (!sent.success) return NextResponse.json({ error: 'We couldn’t send the invite email. Try again shortly.' }, { status: 502 });
    return NextResponse.json({ success: true, team: await listTeam(session.id) });
  }

  if (b.role === undefined && b.jobIds !== undefined) {
    if (member.role !== 'INTERVIEWER') return NextResponse.json({ error: 'Only interviewers can be limited to specific jobs.' }, { status: 400 });
    const jobIds = await cleanJobIds(session.id, b.jobIds);
    if (jobIds === null) return NextResponse.json({ error: 'Choose jobs from this workspace.' }, { status: 400 });
    await prisma.jobBoardTeamMember.update({ where: { id: member.id }, data: { jobIds } });
    return NextResponse.json({ success: true, team: await listTeam(session.id) });
  }

  if (!ROLES.includes(b.role)) return NextResponse.json({ error: 'Choose a role.' }, { status: 400 });
  if (member.id === session.memberId) return NextResponse.json({ error: 'You can’t change your own role.' }, { status: 400 });
  // Job limits only apply to interviewers; other roles always see every job.
  await prisma.jobBoardTeamMember.update({ where: { id: member.id }, data: { role: b.role, ...(b.role !== 'INTERVIEWER' ? { jobIds: [] } : {}) } });
  return NextResponse.json({ success: true, team: await listTeam(session.id) });
}

/** Remove a teammate or cancel an invite. They lose access immediately. Owners only. */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'team.manage')) return forbidden();
  const member = await own(memberId, session.id);
  if (!member) return NextResponse.json({ error: 'Teammate not found.' }, { status: 404 });
  if (member.id === session.memberId) return NextResponse.json({ error: 'You can’t remove yourself. Ask another owner.' }, { status: 400 });
  await prisma.jobBoardTeamMember.update({ where: { id: member.id }, data: { status: 'REMOVED', inviteTokenHash: null, inviteExpiresAt: null } });
  // Hiring and the founder portal are separate teams; say so if they still have founder-portal access.
  const w = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { founderUserId: true } });
  const founderAccessRemains = !!w?.founderUserId && !!(await prisma.founderTeamMember.findFirst({
    where: { founderId: w.founderUserId, email: { equals: member.email, mode: 'insensitive' }, status: { in: ['ACTIVE', 'PENDING'] } }, select: { id: true },
  }));
  return NextResponse.json({ success: true, team: await listTeam(session.id), founderAccessRemains });
}
