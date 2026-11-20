import { NextRequest, NextResponse } from 'next/server';
import { employerApi } from '@/lib/employer/api-session';
import { loadBoard } from '@/lib/employer/applications';

export const dynamic = 'force-dynamic';

const PAGE = 500;

/** Candidates past the board limit, page by page (?job=&skip=&q=); q searches everyone on the server. */
export async function GET(request: NextRequest) {
  const g = await employerApi('candidates.view');
  if (g.error) return g.error;
  const sp = request.nextUrl.searchParams;
  const skip = Math.max(0, Math.min(Number(sp.get('skip')) || 0, 1_000_000));
  const job = sp.get('job') || undefined;
  const cards = await loadBoard(g.session.id, job, g.session.jobIds, { skip, take: PAGE + 1, q: sp.get('q') ?? undefined });
  return NextResponse.json({ cards: cards.slice(0, PAGE), more: cards.length > PAGE });
}
