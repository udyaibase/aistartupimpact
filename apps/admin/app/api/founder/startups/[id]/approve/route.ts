import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { withPublicRefresh } from '@/lib/refresh-public';
import { decideStartupReview } from '@/lib/startup-review';

/** Approve a founder's startup. The decision itself lives in lib/startup-review, shared with the review queue. */
async function postHandler(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error: authError, session } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  if (authError) return authError;
  try {
    const result = await decideStartupReview(params.id, { action: 'approve' }, { email: session?.user?.email, role: session?.user?.role });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Approve startup error:', error?.message);
    return NextResponse.json({ error: 'Failed to approve startup' }, { status: 500 });
  }
}

export const POST = withPublicRefresh(['startups', 'india-ai', 'home'], postHandler);
