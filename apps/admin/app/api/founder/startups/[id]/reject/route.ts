import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { withPublicRefresh } from '@/lib/refresh-public';
import { decideStartupReview } from '@/lib/startup-review';

/**
 * Turn down a founder's startup, with the reason. A startup that is already live is taken down instead (before,
 * "rejecting" a live startup changed nothing). The decision itself lives in lib/startup-review.
 */
async function postHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error: authError, session } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  if (authError) return authError;
  try {
    const body = await request.json().catch(() => ({}));
    const live = await prisma.startup.findFirst({ where: { id: params.id, deletedAt: null }, select: { isApproved: true } });
    const result = await decideStartupReview(
      params.id,
      { action: body.action === 'request_changes' && !live?.isApproved ? 'request_changes' : live?.isApproved ? 'take_down' : 'reject', reasonCode: body.reasonCode || 'OTHER', note: body.reason },
      { email: session?.user?.email, role: session?.user?.role },
    );
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Reject startup error:', error?.message);
    return NextResponse.json({ error: 'Failed to reject startup' }, { status: 500 });
  }
}

export const POST = withPublicRefresh(['startups', 'india-ai', 'home'], postHandler);
