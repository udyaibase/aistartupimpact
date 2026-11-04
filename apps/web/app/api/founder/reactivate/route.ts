import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { setFounderSession } from '@/lib/founder-auth';
import { founderFromCookies } from '@/lib/founder/account';
import { logFounderActivity } from '@/lib/founder/activity';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Brings back a deactivated account for someone already signed in (so password and 2FA were checked at sign-in). */
export async function POST(request: NextRequest) {
  try {
    const { success } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const founder = await founderFromCookies();
    if (!founder) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    if (founder.status === 'SUSPENDED') return NextResponse.json({ error: 'Your account is suspended. Contact support.' }, { status: 403 });
    if (!founder.deactivatedAt) return NextResponse.json({ success: true });

    await prisma.$transaction(async (tx) => {
      await tx.founderUser.update({ where: { id: founder.id }, data: { deactivatedAt: null, lastLoginAt: new Date() } });
      // Show again what deactivating hid: never a listing that was rejected or still waiting for its first approval.
      await tx.startup.updateMany({
        where: {
          ownerId: founder.id,
          deletedAt: null,
          OR: [{ claimStatus: { in: ['CLAIMED', 'VERIFIED'] } }, { claimStatus: 'PENDING', approvedAt: { not: null } }],
        },
        data: { isApproved: true },
      });
      await tx.aiTool.updateMany({
        where: { ownerId: founder.id, deletedAt: null, status: 'ARCHIVED', claimStatus: { in: ['CLAIMED', 'VERIFIED'] } },
        data: { status: 'APPROVED' },
      });
    });

    await setFounderSession(founder.id, founder.email, founder.name, founder.onboardingCompleted);
    await logFounderActivity(founder.id, 'account_reactivated', { request });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Founder reactivation error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Failed to reactivate account' }, { status: 500 });
  }
}
