import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { JOB_REPORT_REASONS, reportListing, reporterHash } from '@/lib/jobs/moderation';

export const dynamic = 'force-dynamic';

/** Public "Report this job". Rate limited; one report per person per job counts. */
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const ip = getClientIdentifier(request);
  const { success } = await checkRateLimit(strictRateLimit, `job-report:${ip}`);
  if (!success) return NextResponse.json({ error: 'Too many reports. Please try again later.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? '');
  if (!JOB_REPORT_REASONS.some((r) => r.value === reason)) return NextResponse.json({ error: 'Choose a reason.', field: 'reason' }, { status: 400 });
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : '';
  if (reason === 'other' && details.length < 10) return NextResponse.json({ error: 'Tell us a little more.', field: 'details' }, { status: 400 });
  const email = typeof body.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ? body.email.trim().slice(0, 200) : null;

  const listing = await prisma.jobBoardListing.findFirst({ where: { slug, deletedAt: null, status: { not: 'DRAFT' } }, select: { id: true, title: true, slug: true } });
  if (!listing) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  await reportListing({ listing, reason, details, email, hash: reporterHash(ip, listing.id) });
  // Same answer either way, so reporters can't tell whether they tipped a job into review.
  return NextResponse.json({ success: true });
}
