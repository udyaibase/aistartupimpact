import { NextRequest, NextResponse } from 'next/server';
import { refreshPayoutStatus } from '@/lib/events/payouts';
import { internalAuthorized } from '@/lib/internal-auth';

export const dynamic = 'force-dynamic';

/**
 * Called by the admin app's Billing → Host payouts screen (Bearer INTERNAL_API_SECRET): { organizerId }.
 * Re-reads the host's payout review status from Razorpay, the same check the host's own Refresh button runs.
 */
export async function POST(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { organizerId } = await request.json().catch(() => ({}));
  if (typeof organizerId !== 'string' || !organizerId) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  try {
    const status = await refreshPayoutStatus(organizerId);
    return status ? NextResponse.json({ status }) : NextResponse.json({ error: 'This host has not started payout setup.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Razorpay did not answer. Try again in a minute.' }, { status: 502 });
  }
}
