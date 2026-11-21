import { NextRequest, NextResponse } from 'next/server';
import { founderApi, tooMany } from '@/lib/founder/api-session';
import { founderWriteRateLimit } from '@/lib/rate-limit';
import { setEmployerSession } from '@/lib/employer-auth';
import { hiringMembershipsFor } from '@/lib/people/access';
import { prisma } from '@udyaibase/database';

export const dynamic = 'force-dynamic';

/** Hiring workspaces the signed-in person is a teammate in (by their founder-portal email). */
export async function GET() {
  const guard = await founderApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  const memberships = await hiringMembershipsFor(session.email);
  return NextResponse.json({
    success: true,
    workspaces: memberships.map((m) => ({ memberId: m.id, role: m.role, startup: m.Employer.Startup?.name ?? m.Employer.companyName })),
  });
}

/** Open one of those workspaces without a second sign-in ({ memberId }): same email, same role as on the hiring team. */
export async function POST(request: NextRequest) {
  const guard = await founderApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  const limited = await tooMany(founderWriteRateLimit, `hiring-switch:${session.userId}`);
  if (limited) return limited;
  const { memberId } = await request.json().catch(() => ({}));
  const m = (await hiringMembershipsFor(session.email)).find((x) => x.id === memberId);
  if (!m) return NextResponse.json({ success: false, error: 'You’re not on that hiring team.' }, { status: 403 });
  const e = await prisma.jobBoardEmployer.findUniqueOrThrow({ where: { id: m.employerId } });
  await prisma.jobBoardTeamMember.update({ where: { id: m.id }, data: { lastActiveAt: new Date() } });
  await setEmployerSession({ id: e.id, email: e.email, companyName: e.companyName, slug: e.slug, plan: e.plan, onboardingCompleted: true }, { id: m.id, email: session.email.toLowerCase() });
  return NextResponse.json({ success: true, redirect: m.role === 'INTERVIEWER' ? '/employer/applications' : '/employer/dashboard' });
}
