import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { publicListingWhere } from '@/lib/jobs/public';
import { employerContext } from '@/lib/employer/applications';
import { DAILY_INVITE_CAP, inviteFromPool, invitesLeftToday, type InviteOutcome } from '@/lib/employer/talent-invite';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Most people one bulk invite covers. */
const BULK_INVITE_MAX = 50;

/**
 * Invite the people picked on the Talent pool page to apply for one open job. Each person is checked the same way
 * as a single invite (still in the pool, not hired, hasn't applied, not invited before), and the daily cap counts
 * every kind of invite.
 */
export async function POST(request: NextRequest) {
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const { success } = await checkRateLimit(apiRateLimit, `talent-invite-bulk:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many invites at once. Try again in a minute.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.applicationIds)
    ? [...new Set((body.applicationIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 64))]
    : [];
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one person.' }, { status: 400 });
  if (ids.length > BULK_INVITE_MAX) return NextResponse.json({ error: `You can invite up to ${BULK_INVITE_MAX} people at a time.` }, { status: 400 });

  const listing = await prisma.jobBoardListing.findFirst({
    where: { id: String(body.listingId ?? ''), employerId: session.id, ...publicListingWhere() },
    select: { id: true, title: true, slug: true },
  });
  if (!listing) return NextResponse.json({ error: 'That job isn’t open.' }, { status: 400 });

  const left = await invitesLeftToday(session.id);
  if (left < 1) return NextResponse.json({ error: `You’ve sent ${DAILY_INVITE_CAP} invites in the last 24 hours. Try again tomorrow.` }, { status: 429 });

  const { company } = await employerContext(session.id);
  const counts: Record<InviteOutcome, number> = { invited: 0, not_in_pool: 0, applied: 0, hired: 0, already_invited: 0 };
  const invitedIds: string[] = [];
  let skippedForCap = 0;
  for (const applicationId of ids) {
    if (counts.invited >= left) { skippedForCap++; continue; }
    const outcome = await inviteFromPool({ employerId: session.id, invitedByEmail: session.email, company, applicationId, listing });
    counts[outcome]++;
    if (outcome === 'invited') invitedIds.push(applicationId);
  }
  return NextResponse.json({ success: true, ...counts, skippedForCap, invitedIds, listingTitle: listing.title });
}
