import { NextRequest, NextResponse } from 'next/server';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { recordWithdrawal } from '@/lib/employer/offers';

export const dynamic = 'force-dynamic';

/** The candidate withdrew (told the team): { reason?, reasonBy? }. No email is sent. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/withdrawn');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('candidates.move');
  if (g.error) return g.error;
  const r = await recordWithdrawal(g.session, id, await request.json().catch(() => ({})));
  return r.ok ? NextResponse.json({ success: true }) : fail(r);
}
