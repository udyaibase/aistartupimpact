import { NextRequest, NextResponse } from 'next/server';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { recordDecision } from '@/lib/employer/decisions';

export const dynamic = 'force-dynamic';

/** The final decision: { decision: PROCEED | REJECT | BACKUP, reason, rejectReason?, email?, holdUntil? }. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/decision');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('candidates.move');
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const email = b.email && typeof b.email.subject === 'string' && typeof b.email.body === 'string'
    ? { subject: b.email.subject.slice(0, 200), body: b.email.body.slice(0, 5000), sendAt: typeof b.email.sendAt === 'string' ? b.email.sendAt : null } : null;
  const holdUntil = typeof b.holdUntil === 'string' && !Number.isNaN(Date.parse(b.holdUntil)) ? new Date(b.holdUntil) : null;
  const r = await recordDecision({ session: g.session, applicationId: id, decision: b.decision, reason: b.reason, rejectReason: b.rejectReason, email, holdUntil });
  return r.ok ? NextResponse.json({ success: true, offerId: r.offerId ?? null }) : fail(r);
}
