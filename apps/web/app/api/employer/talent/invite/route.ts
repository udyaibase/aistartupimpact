import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { publicListingWhere } from '@/lib/jobs/public';
import { employerContext } from '@/lib/employer/applications';
import { inviteFromPool } from '@/lib/employer/talent-invite';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

const ERRORS = {
  not_in_pool: ['This person is no longer in your talent pool.', 404],
  applied: ['They already applied for this job.', 409],
  hired: ['You’ve already hired this person.', 409],
  already_invited: ['Already invited to this job.', 409],
} as const;

/** Invite a talent-pool candidate to apply for an open job. Once per person per job. */
export async function POST(request: NextRequest) {
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const { success } = await checkRateLimit(apiRateLimit, `talent-invite:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many invites at once. Try again in a minute.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const listing = await prisma.jobBoardListing.findFirst({
    where: { id: String(body.listingId ?? ''), employerId: session.id, ...publicListingWhere() },
    select: { id: true, title: true, slug: true },
  });
  if (!listing) return NextResponse.json({ error: 'That job isn’t open.' }, { status: 400 });

  const { company } = await employerContext(session.id);
  const outcome = await inviteFromPool({ employerId: session.id, invitedByEmail: session.email, company, applicationId: String(body.applicationId ?? ''), listing });
  if (outcome !== 'invited') {
    const [error, status] = ERRORS[outcome];
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ success: true });
}
