import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession, type EmployerRole } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { cleanJobIds, inviteTeammate, listTeam } from '@/lib/employer/team';

export const dynamic = 'force-dynamic';

const ROLES: EmployerRole[] = ['OWNER', 'RECRUITER', 'INTERVIEWER'];

/** Team list (any teammate can see it, e.g. for @mentions). */
export async function GET() {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  return NextResponse.json({ team: await listTeam(session.id), me: { memberId: session.memberId, email: session.email, role: session.role } });
}

/** Workspace team settings (owners only): { requireJobApproval } makes recruiters' new jobs wait for an owner. */
export async function PATCH(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'team.manage')) return forbidden();
  const b = await request.json().catch(() => ({}));
  if (typeof b.requireJobApproval !== 'boolean') return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { requireJobApproval: b.requireJobApproval } });
  return NextResponse.json({ success: true, requireJobApproval: b.requireJobApproval });
}

/** Invite a teammate by email (owners only). Re-inviting refreshes the link. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'team.manage')) return forbidden();
  const { success } = await checkRateLimit(apiRateLimit, `team-invite:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many invites. Try again shortly.' }, { status: 429 });

  const b = await request.json().catch(() => ({}));
  const role = ROLES.includes(b.role) ? (b.role as EmployerRole) : 'RECRUITER';
  const jobIds = role === 'INTERVIEWER' ? await cleanJobIds(session.id, b.jobIds) : [];
  if (jobIds === null) return NextResponse.json({ error: 'Choose jobs from this workspace.', field: 'jobIds' }, { status: 400 });
  const r = await inviteTeammate({
    employerId: session.id, inviter: { email: session.email, name: session.memberName },
    email: String(b.email ?? ''), role, confirmOutsideDomain: b.confirmOutsideDomain === true, jobIds,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, field: r.field, code: r.code, domain: r.domain }, { status: r.status });
  return NextResponse.json({ success: true, team: await listTeam(session.id) }, { status: 201 });
}
