import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import bcrypt from 'bcryptjs';
import { requireEmployerAuth, clearEmployerSession } from '@/lib/employer-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();

    const body = await request.json().catch(() => ({}));
    const { password } = body as { password?: string };
    if (!password) {
      return NextResponse.json({ success: false, error: 'Password is required to delete your account' }, { status: 400 });
    }

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!employer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    if (employer.passwordHash) {
      const valid = await bcrypt.compare(password, employer.passwordHash);
      if (!valid) {
        return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.newsletterSubscriber.updateMany({
        where: { email: employer.email },
        data: { isActive: false, unsubscribedAt: new Date() },
      });

      await tx.jobBoardEmployer.delete({ where: { id: employer.id } });
    });

    await clearEmployerSession();

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting employer account:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
