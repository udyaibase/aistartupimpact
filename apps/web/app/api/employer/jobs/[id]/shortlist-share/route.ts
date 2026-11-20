import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { writeLimited } from '@/lib/employer/write-limit';
import { createShare } from '@/lib/employer/shortlist-share';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

async function ownJob(id: string, employerId: string) {
  return prisma.jobBoardListing.findFirst({ where: { id, employerId, deletedAt: null, isGeneral: false }, select: { id: true } });
}

/** Active shortlist links for this job, with how many candidates each has voted on. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  if (!(await ownJob(id, session.id))) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  const shares = await prisma.jobBoardShortlistShare.findMany({
    where: { employerId: session.id, listingId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, sharedWithName: true, expiresAt: true, lastViewedAt: true, _count: { select: { Votes: true } } },
  });
  return NextResponse.json({ shares: shares.map((s) => ({ id: s.id, name: s.sharedWithName, expiresAt: s.expiresAt, lastViewedAt: s.lastViewedAt, votes: s._count.Votes })) });
}

/** Creates a private link for someone outside the portal (e.g. a co-founder) to vote on the shortlist. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'jobs/[id]/shortlist-share');
  if (limited) return limited;
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  if (!(await ownJob(id, session.id))) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  const b = await request.json().catch(() => ({}));
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 2) return NextResponse.json({ error: 'Who is this link for? Add their name.', field: 'name' }, { status: 400 });
  const active = await prisma.jobBoardShortlistShare.count({ where: { employerId: session.id, listingId: id, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (active >= 10) return NextResponse.json({ error: 'This job already has 10 active links. Turn one off first.' }, { status: 400 });
  return NextResponse.json(await createShare({ employerId: session.id, listingId: id, sharedWithName: name, createdByEmail: session.email }));
}

/** Turns a link off straight away (?share=<id>). */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'jobs/[id]/shortlist-share');
  if (limited) return limited;
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const shareId = request.nextUrl.searchParams.get('share') ?? '';
  const r = await prisma.jobBoardShortlistShare.updateMany({ where: { id: shareId, employerId: session.id, listingId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Link not found.' }, { status: 404 });
}
