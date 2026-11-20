import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { cancelAssessment, configOf, extendAssessment, listAssessments, reviewAssessment, sendAssessment } from '@/lib/employer/assessments';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await employerApi('candidates.view');
  if (g.error) return g.error;
  const app = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: { employerId: g.session.id, ...(g.session.jobIds ? { id: { in: g.session.jobIds } } : {}) } },
    select: { id: true, Listing: { select: { assessment: true } } },
  });
  if (!app) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  return NextResponse.json({ config: configOf(app.Listing.assessment), assessments: await listAssessments(id) });
}

/**
 * { action: 'send', deadlineDays?, note? } | { action: 'review', assessmentId, score, notes, decision?: MOVE_ON|NOT_MOVING_AHEAD, rejectReason?, email? }
 * | { action: 'extend', assessmentId, days } | { action: 'resubmit', assessmentId, days } | { action: 'cancel', assessmentId, notify }
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/assessment');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('candidates.move');
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const aid = typeof b.assessmentId === 'string' ? b.assessmentId : '';
  // The assessment must belong to this candidate.
  if (b.action !== 'send' && !(await prisma.jobBoardAssessment.findFirst({ where: { id: aid, applicationId: id }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Assessment not found.' }, { status: 404 });
  }
  switch (b.action) {
    case 'send': { const r = await sendAssessment(g.session, id, { deadlineDays: b.deadlineDays, note: b.note }); return r.ok ? NextResponse.json({ success: true, id: r.id }) : fail(r); }
    case 'review': {
      const email = b.email && typeof b.email.subject === 'string' && typeof b.email.body === 'string' ? { subject: b.email.subject.slice(0, 200), body: b.email.body.slice(0, 5000) } : null;
      const r = await reviewAssessment(g.session, aid, { score: b.score, rubricScores: b.rubricScores, notes: b.notes, decision: b.decision, rejectReason: b.rejectReason, email });
      return r.ok ? NextResponse.json({ success: true }) : fail(r);
    }
    case 'extend':
    case 'resubmit': { const r = await extendAssessment(g.session, aid, { days: b.days, resubmit: b.action === 'resubmit' }); return r.ok ? NextResponse.json({ success: true, dueAt: r.dueAt }) : fail(r); }
    case 'cancel': return (await cancelAssessment(g.session.id, aid, { notify: b.notify !== false, actorEmail: g.session.email })) ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'It isn’t open.' }, { status: 409 });
    default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
