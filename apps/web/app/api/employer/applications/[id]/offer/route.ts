import { NextRequest, NextResponse } from 'next/server';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { loadOffers, markJoined, markNotJoined, recordOfferAnswer, saveOffer, sendOffer, withdrawOffer } from '@/lib/employer/offers';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await employerApi('candidates.view');
  if (g.error) return g.error;
  const data = await loadOffers(g.session, id);
  return data ? NextResponse.json(data) : NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
}

/**
 * { action: 'save', fixedAnnual, variableAnnual, joiningDate, answerBy, firmExpiry, notes } | { action: 'send', confirmOvercommit? }
 * | { action: 'answer', answer: ACCEPTED|DECLINED, reason?, reasonBy?, joiningDate? } | { action: 'withdraw' }
 * | { action: 'joined' } | { action: 'not-joined', reason?, reasonBy? }
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/offer');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('candidates.move');
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const s = g.session;
  switch (b.action) {
    case 'save': { const r = await saveOffer(s, id, b); return r.ok ? NextResponse.json({ success: true, id: r.id }) : fail(r); }
    case 'send': { const r = await sendOffer(s, id, { confirmOvercommit: b.confirmOvercommit === true }); return r.ok ? NextResponse.json({ success: true }) : fail(r); }
    case 'answer': { const r = await recordOfferAnswer(s, id, b); return r.ok ? NextResponse.json({ success: true }) : fail(r); }
    case 'withdraw': return (await withdrawOffer(s, id)) ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'No open offer to withdraw.' }, { status: 409 });
    case 'joined': { const r = await markJoined(s, id); return r.ok ? NextResponse.json({ success: true, filledJobs: r.filledJobs ?? [] }) : fail(r); }
    case 'not-joined': { const r = await markNotJoined(s, id, b); return r.ok ? NextResponse.json({ success: true, backups: r.backups }) : fail(r); }
    default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
