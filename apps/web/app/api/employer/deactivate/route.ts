import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireEmployerAuth, clearEmployerSession, sessionCutoff } from '@/lib/employer-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { can, forbidden } from '@/lib/employer/permissions';
import { refreshSections } from '@/lib/revalidate';
import { checkActionCode } from '@/lib/employer/account-action';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { deactivatedAt: true },
    });

    if (!employer) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (employer.deactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const check = await checkActionCode(session.email, (body as { code?: unknown }).code);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

    await prisma.$transaction(async (tx) => {
      await tx.jobBoardEmployer.update({
        where: { id: session.id },
        // The cut-off keeps old sessions signed out if the workspace is reactivated later.
        data: { deactivatedAt: new Date(), sessionsValidAfter: sessionCutoff() },
      });

      await tx.jobBoardListing.updateMany({
        where: { employerId: session.id, status: 'OPEN' },
        data: { isActive: false, status: 'PAUSED' },
      });
    });

    await clearEmployerSession();

    refreshSections(['jobs', 'startups', 'home']);
    return NextResponse.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    if (error instanceof Error && error.message === 'EMPLOYER_AUTH_REQUIRED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Employer deactivation error:', error);
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
  }
}
