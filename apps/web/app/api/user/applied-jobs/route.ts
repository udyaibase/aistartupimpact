import { NextResponse } from 'next/server';
import { claimApplications, getCandidate, listMyApplications } from '@/lib/jobs/candidate-account';

export const dynamic = 'force-dynamic';

/**
 * The jobs the signed-in job seeker has applied for, so cached job pages and lists can show "Applied" and link to
 * the application instead of offering Apply again. Signed out: an empty list.
 */
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  const me = await getCandidate().catch(() => null);
  if (!me) return NextResponse.json({ jobs: [] }, { headers });
  await claimApplications(me).catch(() => 0);
  const rows = await listMyApplications(me.id);
  return NextResponse.json({
    jobs: rows.filter((r) => r.Listing && !r.Listing.isGeneral).map((r) => ({
      slug: r.Listing!.slug, id: r.id, appliedAt: r.appliedAt.toISOString(), withdrawn: !!r.withdrawnAt,
    })),
  }, { headers });
}
