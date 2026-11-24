import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { can } from '@/lib/employer/permissions';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { publicListingWhere } from '@/lib/jobs/public';
import { employerContext } from '@/lib/employer/applications';
import { DAILY_INVITE_CAP, inviteFromPool, invitesLeftToday, poolMatchesForJob } from '@/lib/employer/talent-invite';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Past applicants in the talent pool who match this open job (people who can move candidates only). */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const matches = await poolMatchesForJob(session.id, id);
  return NextResponse.json({ count: matches.length, people: matches.slice(0, 100) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** "Invite all": invites every matching pool member (up to 100 at a time). Re-running never invites anyone twice. */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const { success } = await checkRateLimit(apiRateLimit, `talent-invite-all:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many invites at once. Try again in a minute.' }, { status: 429 });
  const listing = await prisma.jobBoardListing.findFirst({ where: { id, employerId: session.id, ...publicListingWhere() }, select: { id: true, title: true, slug: true } });
  if (!listing) return NextResponse.json({ error: 'That job isn’t open.' }, { status: 400 });
  const [matches, { company }, left] = await Promise.all([poolMatchesForJob(session.id, id), employerContext(session.id), invitesLeftToday(session.id)]);
  if (left < 1) return NextResponse.json({ error: `You’ve sent ${DAILY_INVITE_CAP} invites in the last 24 hours. Try again tomorrow.` }, { status: 429 });
  let invited = 0;
  let tried = 0;
  for (const m of matches) {
    if (invited >= left || tried >= 100) break;
    tried++;
    if ((await inviteFromPool({ employerId: session.id, invitedByEmail: session.email, company, applicationId: m.id, listing })) === 'invited') invited++;
  }
  return NextResponse.json({ success: true, invited, remaining: Math.max(0, matches.length - tried) });
}
