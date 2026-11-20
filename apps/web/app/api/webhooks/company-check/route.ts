import { NextRequest, NextResponse } from 'next/server';
import { internalAuthorized } from '@/lib/internal-auth';
import { decideCompanyReview } from '@/lib/employer/company-check';

export const dynamic = 'force-dynamic';

/**
 * Called by the admin app with the company check decision: { employerId, approve, note, reviewer }.
 * Passing publishes the jobs waiting for it (up to 2 live); failing emails the team the note.
 */
export async function POST(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  if (typeof b.employerId !== 'string' || typeof b.approve !== 'boolean' || typeof b.reviewer !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const r = await decideCompanyReview({ employerId: b.employerId, approve: b.approve, note: typeof b.note === 'string' ? b.note : null, reviewer: b.reviewer });
  return r.ok ? NextResponse.json({ success: true, published: r.published }) : NextResponse.json({ error: r.error }, { status: 400 });
}
