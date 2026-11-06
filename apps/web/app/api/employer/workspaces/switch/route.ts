import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession, setEmployerSession } from '@/lib/employer-auth';
import { needsTwoFactor } from '@/lib/employer/sign-in';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';

/**
 * Switch to another hiring team the same person belongs to (active membership with the signed-in email).
 * The new session carries that workspace and membership; nothing about the current one is reused.
 */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'workspaces/switch');
  if (limited) return limited;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { employerId } = await request.json().catch(() => ({}));
  if (typeof employerId !== 'string' || !employerId) return NextResponse.json({ error: 'Choose a team.' }, { status: 400 });

  const m = await prisma.jobBoardTeamMember.findFirst({
    where: { employerId, email: session.email.toLowerCase(), status: 'ACTIVE', Employer: { isActive: true, deactivatedAt: null, deletedAt: null } },
    include: { Employer: { select: { id: true, email: true, companyName: true, slug: true, plan: true, twoFactorEnabled: true } } },
  });
  if (!m) return NextResponse.json({ error: 'You’re not on that team.' }, { status: 403 });
  if (needsTwoFactor(m)) return NextResponse.json({ error: 'That workspace uses two-step sign-in. Sign out and sign in to it directly.' }, { status: 403 });

  await prisma.jobBoardTeamMember.update({ where: { id: m.id }, data: { lastActiveAt: new Date() } });
  const e = m.Employer;
  await setEmployerSession({ id: e.id, email: e.email, companyName: e.companyName, slug: e.slug, plan: e.plan, onboardingCompleted: true }, { id: m.id, email: m.email });
  return NextResponse.json({ success: true, redirect: m.role === 'INTERVIEWER' ? '/employer/applications' : '/employer/dashboard' });
}
