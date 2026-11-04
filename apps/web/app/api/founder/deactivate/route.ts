import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { confirmAccountPassword } from '@/lib/founder/account';
import { logFounderActivity } from '@/lib/founder/activity';
import { requireFounderAuth, clearFounderSession } from '@/lib/founder-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireFounderAuth();

    const body = await request.json().catch(() => ({}));
    const { password } = (await request.json().catch(() => ({}))) as { password?: unknown };

    const user = await prisma.founderUser.findUnique({
      where: { id: session.userId },
      select: { deactivatedAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.deactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated' }, { status: 400 });
    }

    if (!(await confirmAccountPassword(session.email.toLowerCase(), password))) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.founderUser.update({
        where: { id: session.userId },
        data: { deactivatedAt: new Date() },
      });

      await tx.startup.updateMany({
        where: { ownerId: session.userId },
        data: { isApproved: false },
      });

      // Hide tools too. Reactivating brings back the ones that were live (rejected tools stay rejected).
      await tx.aiTool.updateMany({
        where: { ownerId: session.userId, status: { in: ['APPROVED', 'FEATURED'] } },
        data: { status: 'ARCHIVED' },
      });

      await tx.founderSession.deleteMany({
        where: { userId: session.userId },
      });
    });

    await logFounderActivity(session.userId, 'account_deactivated', { request });
    // The session cookies stay: the portal shows this person the reactivate page next time they come back.
    await clearFounderSession();

    return NextResponse.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized - Please login') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Founder deactivation error:', error);
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
  }
}
