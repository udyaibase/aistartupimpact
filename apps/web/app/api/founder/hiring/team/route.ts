import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getFounderSession } from '@/lib/founder-auth';
import { founderOwnsVerifiedStartup } from '@/lib/startups/ownership';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { inviteTeammate, listTeam } from '@/lib/employer/team';

export const dynamic = 'force-dynamic';

/**
 * Hiring team from the founder portal. A shortcut to the same team the employer Team page manages:
 * only the founder who owns the verified startup, and only for that startup's own hiring workspace.
 */
async function workspaceFor(startupId: unknown) {
  const session = await getFounderSession();
  if (!session) return { error: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) };
  if (typeof startupId !== 'string' || !startupId) return { error: NextResponse.json({ error: 'Choose a startup.' }, { status: 400 }) };
  if (!(await founderOwnsVerifiedStartup(session.userId, startupId))) {
    return { error: NextResponse.json({ error: 'Verify ownership of this startup first.' }, { status: 403 }) };
  }
  const ws = await prisma.jobBoardEmployer.findFirst({
    where: { startupId, founderUserId: session.userId, isActive: true, deactivatedAt: null },
    select: { id: true },
  });
  if (!ws) return { error: NextResponse.json({ error: 'Start hiring first, then invite your team.', code: 'no_workspace' }, { status: 409 }) };
  return { session, employerId: ws.id };
}

export async function GET(request: NextRequest) {
  const w = await workspaceFor(request.nextUrl.searchParams.get('startupId'));
  if ('error' in w) return w.error;
  return NextResponse.json({ team: await listTeam(w.employerId) });
}

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const w = await workspaceFor(b.startupId);
  if ('error' in w) return w.error;
  const { success } = await checkRateLimit(apiRateLimit, `team-invite:${w.employerId}`);
  if (!success) return NextResponse.json({ error: 'Too many invites. Try again shortly.' }, { status: 429 });

  const role = b.role === 'INTERVIEWER' ? 'INTERVIEWER' : 'RECRUITER';
  const r = await inviteTeammate({
    employerId: w.employerId, inviter: { email: w.session.email, name: w.session.name },
    email: String(b.email ?? ''), role, confirmOutsideDomain: b.confirmOutsideDomain === true,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, field: r.field, code: r.code, domain: r.domain }, { status: r.status });
  return NextResponse.json({ success: true, team: await listTeam(w.employerId) }, { status: 201 });
}

/** Remove a teammate (takes effect on their next request). */
export async function DELETE(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const w = await workspaceFor(b.startupId);
  if ('error' in w) return w.error;
  const removed = await prisma.jobBoardTeamMember.updateMany({
    where: { id: String(b.memberId ?? ''), employerId: w.employerId, status: { in: ['PENDING', 'ACTIVE'] } },
    data: { status: 'REMOVED', inviteTokenHash: null, inviteExpiresAt: null },
  });
  if (!removed.count) return NextResponse.json({ error: 'Teammate not found.' }, { status: 404 });
  return NextResponse.json({ success: true, team: await listTeam(w.employerId) });
}
