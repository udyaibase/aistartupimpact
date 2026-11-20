import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi } from '@/lib/employer/api-session';
import { canDecide, loadFinalists } from '@/lib/employer/decisions';

export const dynamic = 'force-dynamic';

/** Finalists side by side (?ids= picks up to 8; default: everyone in Final decision). */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await employerApi('candidates.view');
  if (g.error) return g.error;
  if (g.session.role === 'INTERVIEWER') return NextResponse.json({ error: 'The comparison is for the people deciding.' }, { status: 403 });
  const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').filter((x) => /^[a-z0-9]{20,30}$/.test(x));
  const data = await loadFinalists(g.session.id, id, g.session.jobIds, ids);
  if (!data) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  const job = await prisma.jobBoardListing.findUnique({ where: { id }, select: { decisionOwnerEmail: true, decisionDelegateEmail: true } });
  return NextResponse.json({ ...data, canDecide: !!job && canDecide(g.session, job) });
}
