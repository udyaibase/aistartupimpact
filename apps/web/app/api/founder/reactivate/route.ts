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
      // Show again what deactivating hid: only listings our team had approved (they carry an approval date).
      // Proving ownership of the domain is not approval, so a verified startup still waiting for review stays hidden.
      await tx.startup.updateMany({
        where: { ownerId: founder.id, deletedAt: null, approvedAt: { not: null }, claimStatus: { not: 'REJECTED' } },
        data: { isApproved: true },
      });
      await tx.aiTool.updateMany({
        // Only tools our team had approved. Proving ownership is not approval, so a tool that was turned down and
        // verified afterwards stays hidden.
        where: { ownerId: founder.id, deletedAt: null, status: 'ARCHIVED', reviewStatus: 'APPROVED', approvedAt: { not: null }, claimStatus: { not: 'REJECTED' } },
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
