import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { confirmAccountAction } from '@/lib/founder/account';
import { logFounderActivity } from '@/lib/founder/activity';
import { clearFounderSession } from '@/lib/founder-auth';
import { founderApi } from '@/lib/founder/api-session';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    // Read once: a request body can't be read a second time.
    const body = (await request.json().catch(() => ({}))) as { password?: unknown; otpToken?: unknown; code?: unknown };

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

    const confirmed = await confirmAccountAction(session, body, 'deactivate');
    if (!confirmed.ok) return NextResponse.json({ error: confirmed.error }, { status: 401 });

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
    // The other sign-in cookies stay: the portal shows this person the reactivate page next time they come back.
    await clearFounderSession();

    return NextResponse.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    console.error('Founder deactivation error:', error);
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
  }
}
