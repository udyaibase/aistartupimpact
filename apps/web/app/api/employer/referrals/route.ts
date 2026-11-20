import { NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getOrCreateReferrer, referralJobLink } from '@/lib/employer/referrals';
import { publicListingWhere } from '@/lib/jobs/public';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** The signed-in person's referral links for every open job (anyone on the team can refer). */
export async function GET() {
  const guard = await employerApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  const ref = await getOrCreateReferrer(session.id, {
    email: session.email, memberId: session.memberId, name: session.memberName || session.email.split('@')[0],
  });
  const [jobs, referred] = await Promise.all([
    prisma.jobBoardListing.findMany({
      where: { employerId: session.id, isGeneral: false, applicationType: { not: 'EXTERNAL' }, ...publicListingWhere() },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, title: true, slug: true },
      take: 50,
    }),
    prisma.jobBoardApplication.count({ where: { referrerId: ref.id } }),
  ]);
  return NextResponse.json({
    code: ref.code,
    referred,
    jobs: jobs.map((j) => ({ id: j.id, title: j.title, link: referralJobLink(j.slug, ref.code) })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
