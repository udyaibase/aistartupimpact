import { NextRequest, NextResponse } from 'next/server';
import type { JobBoardAppStatus } from '@prisma/client';
import { getEmployerSession } from '@/lib/employer-auth';
import { employerContext, saveBookingUrl } from '@/lib/employer/applications';
import { MOVABLE, moveApplications } from '@/lib/employer/pipeline';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Move many candidates at once (e.g. reject 150). The client sends a batchKey (UUID);
 * retrying with the same key never re-moves or re-emails anyone.
 */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'candidates.move')) return forbidden();

  const b = await request.json().catch(() => ({}));
  const toStatus = b.toStatus as JobBoardAppStatus;
  const ids = Array.isArray(b.ids) ? b.ids.filter((x: unknown) => typeof x === 'string').slice(0, 1000) : [];
  const batchKey = typeof b.batchKey === 'string' && /^[\w-]{8,64}$/.test(b.batchKey) ? b.batchKey : null;
  if (!MOVABLE.includes(toStatus)) return NextResponse.json({ error: 'Choose a stage.' }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: 'Select at least one candidate.' }, { status: 400 });
  if (!batchKey) return NextResponse.json({ error: 'Missing batch key.' }, { status: 400 });

  const ctx = await employerContext(session.id);
  const bookingUrl = await saveBookingUrl(session.id, b.bookingUrl, ctx.bookingUrl);
  if (bookingUrl === false) return NextResponse.json({ error: 'Booking link must start with https://', field: 'bookingUrl' }, { status: 400 });

  const email = b.email && typeof b.email.subject === 'string' && typeof b.email.body === 'string'
    ? { subject: b.email.subject.slice(0, 200), body: b.email.body.slice(0, 5000), sendAt: typeof b.email.sendAt === 'string' ? b.email.sendAt : null }
    : null;
  const result = await moveApplications({
    employerId: session.id, actorEmail: session.email, company: ctx.company, bookingUrl, ids, toStatus, email, batchKey,
  });
  return NextResponse.json({ success: true, result });
}
