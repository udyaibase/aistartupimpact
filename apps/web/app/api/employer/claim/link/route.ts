import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { isClaimVerified, VERIFIED_CLAIM_METHODS } from '@/lib/jobs/trust';

export const dynamic = 'force-dynamic';

/**
 * Link this workspace to the startup it hires for. Linking grants nothing public: jobs stay drafts until the
 * startup's founder verifies the startup in the founder portal and takes over the workspace ("Start hiring").
 * Only founders verify startups; there is no employer-side verification.
 */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'company.manage')) return forbidden();
  const { success } = await checkRateLimit(apiRateLimit, `claim-link:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const [me, startup] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { startupId: true, startupClaimMethod: true } }),
    prisma.startup.findFirst({ where: { id: String(body.startupId ?? ''), deletedAt: null }, select: { id: true, name: true, slug: true, isVerified: true } }),
  ]);
  if (!startup) return NextResponse.json({ error: 'Startup not found.' }, { status: 404 });
  if (me && isClaimVerified(me)) return NextResponse.json({ error: 'Your workspace is already verified for a startup.' }, { status: 409 });

  // The startup's own team already hires here: join it instead of starting a second workspace.
  const team = await prisma.jobBoardEmployer.findFirst({
    where: { startupId: startup.id, id: { not: session.id }, passwordHash: { not: '' }, startupClaimMethod: { in: [...VERIFIED_CLAIM_METHODS] } },
    select: { id: true },
  });
  if (team) return NextResponse.json({ error: `${startup.name} already hires on Udyaibase. Ask its team to invite you.`, code: 'team_exists' }, { status: 409 });

  await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { startupId: startup.id, startupClaimMethod: null, startupClaimVerifiedAt: null } });
  return NextResponse.json({ success: true, startup });
}
