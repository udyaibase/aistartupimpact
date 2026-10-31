import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { publicListingWhere } from '@/lib/jobs/public';
import { employerContext } from '@/lib/employer/applications';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';

export const dynamic = 'force-dynamic';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

/** Invite a talent-pool candidate to apply for an open job. Once per person per job. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'candidates.move')) return forbidden();
  const { success } = await checkRateLimit(apiRateLimit, `talent-invite:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many invites at once. Try again in a minute.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const [app, listing] = await Promise.all([
    prisma.jobBoardApplication.findFirst({
      where: { id: String(body.applicationId ?? ''), Listing: { employerId: session.id }, talentPoolUntil: { gt: new Date() }, NOT: { email: { endsWith: '@deleted.invalid' } } },
      select: { id: true, email: true, fullName: true },
    }),
    prisma.jobBoardListing.findFirst({
      where: { id: String(body.listingId ?? ''), employerId: session.id, ...publicListingWhere() },
      select: { id: true, title: true, slug: true },
    }),
  ]);
  if (!app) return NextResponse.json({ error: 'This person is no longer in your talent pool.' }, { status: 404 });
  if (!listing) return NextResponse.json({ error: 'That job isn’t open.' }, { status: 400 });

  const already = await prisma.jobBoardApplication.findFirst({ where: { listingId: listing.id, email: app.email }, select: { id: true } });
  if (already) return NextResponse.json({ error: 'They already applied for this job.' }, { status: 409 });
  const sameEmail = await prisma.jobBoardTalentInvite.findFirst({ where: { listingId: listing.id, Application: { email: app.email } }, select: { id: true } });
  if (sameEmail) return NextResponse.json({ error: 'Already invited to this job.' }, { status: 409 });

  try {
    await prisma.jobBoardTalentInvite.create({ data: { applicationId: app.id, listingId: listing.id, invitedByEmail: session.email } });
  } catch {
    return NextResponse.json({ error: 'Already invited to this job.' }, { status: 409 });
  }

  const { company } = await employerContext(session.id);
  const link = `${SITE}/jobs/${listing.slug}?utm_source=talent_pool&utm_medium=email`;
  sendEmailFireAndForget({
    to: app.email,
    subject: `${company} would like you to apply: ${listing.title}`,
    type: 'job_talent_invite',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Hi ${esc(app.fullName.split(' ')[0] || app.fullName)}, ${esc(company)} thought of you</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">They’re hiring for <strong>${esc(listing.title)}</strong> and invited you to apply, based on your earlier application.</p>
<p style="margin:0 0 24px">${button(link, 'See the role')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">You’re getting this because you chose to hear about other roles at ${esc(company)}. To stop, open the application link from your earlier “Application received” email and turn it off.</p>`),
  });
  return NextResponse.json({ success: true });
}
