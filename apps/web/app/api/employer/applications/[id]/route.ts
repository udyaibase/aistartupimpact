import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@udyaibase/database';
import type { JobBoardAppStatus } from '@prisma/client';
import { getEmployerSession } from '@/lib/employer-auth';
import { employerContext, loadDetail, saveBookingUrl } from '@/lib/employer/applications';
import { MOVABLE, moveApplications } from '@/lib/employer/pipeline';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ error: 'Please log in again.' }, { status: 401 });

/** Candidate detail for the side panel. Opening a new candidate marks them "Seen". */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return unauthorized();
  if (!can(session.role, 'candidates.view')) return forbidden();

  const detail = await loadDetail(session.id, id, session.jobIds);
  if (!detail) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  if (detail.status === 'APPLIED' && !detail.withdrawnAt) {
    await prisma.jobBoardApplication.update({ where: { id }, data: { status: 'REVIEWED', reviewedAt: new Date() } });
    detail.status = 'REVIEWED';
  }
  return NextResponse.json({ application: detail });
}

/** Move one candidate to a stage, optionally with an (edited) email. */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return unauthorized();
  if (!can(session.role, 'candidates.move')) return forbidden();

  const b = await request.json().catch(() => ({}));
  const toStatus = b.toStatus as JobBoardAppStatus;
  if (!MOVABLE.includes(toStatus)) return NextResponse.json({ error: 'Choose a stage.' }, { status: 400 });

  const ctx = await employerContext(session.id);
  const bookingUrl = await saveBookingUrl(session.id, b.bookingUrl, ctx.bookingUrl);
  if (bookingUrl === false) return NextResponse.json({ error: 'Booking link must start with https://', field: 'bookingUrl' }, { status: 400 });

  const email = b.email && typeof b.email.subject === 'string' && typeof b.email.body === 'string'
    ? { subject: b.email.subject.slice(0, 200), body: b.email.body.slice(0, 5000), sendAt: typeof b.email.sendAt === 'string' ? b.email.sendAt : null }
    : null;
  const result = await moveApplications({
    employerId: session.id, actorEmail: session.email, company: ctx.company, bookingUrl,
    ids: [id], toStatus, email, batchKey: typeof b.batchKey === 'string' && b.batchKey.length <= 64 ? b.batchKey : randomUUID(),
  });
  if (result.moved === 0 && result.skipped === 1) {
    return NextResponse.json({ error: 'This candidate can’t be moved (withdrawn, or already in that stage).', result }, { status: 409 });
  }
  return NextResponse.json({ success: true, result });
}
