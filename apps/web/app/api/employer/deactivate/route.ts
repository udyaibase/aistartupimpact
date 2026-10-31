import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import bcrypt from 'bcryptjs';
import { requireEmployerAuth, clearEmployerSession } from '@/lib/employer-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { can, forbidden } from '@/lib/employer/permissions';
import { refreshPaths, refreshSections } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();

    const body = await request.json().catch(() => ({}));
    const { password } = body as { password?: string };
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { passwordHash: true, deactivatedAt: true },
    });

    if (!employer) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (employer.deactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated' }, { status: 400 });
    }

    const valid = await bcrypt.compare(password, employer.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobBoardEmployer.update({
        where: { id: session.id },
        data: { deactivatedAt: new Date() },
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
