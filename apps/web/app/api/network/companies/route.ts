import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { getCandidate } from '@/lib/jobs/candidate-account';

export const dynamic = 'force-dynamic';

/** Companies hiring on Udyaibase whose name matches, so a job seeker can hide their profile from them. */
export async function GET(req: NextRequest) {
  const me = await getCandidate();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { success } = await checkRateLimit(applicationStatusRateLimit, `network-companies:${me.id}:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ companies: [] });
  const companies = await prisma.jobBoardEmployer.findMany({
    where: { deletedAt: null, isActive: true, passwordHash: { not: '' }, companyName: { contains: q, mode: 'insensitive' } },
    orderBy: { companyName: 'asc' },
    take: 8,
    select: { id: true, companyName: true },
  });
  return NextResponse.json({ companies: companies.map((c) => ({ id: c.id, name: c.companyName })) });
}
