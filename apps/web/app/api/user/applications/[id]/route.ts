import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { eraseApplication } from '@/lib/jobs/candidate-status';
import { findMyApplication, getCandidate } from '@/lib/jobs/candidate-account';

export const dynamic = 'force-dynamic';

/** From "My applications": withdraw one, or delete my data for it. The signed-in session is the proof. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const me = await getCandidate();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { success } = await checkRateLimit(applicationStatusRateLimit, getClientIdentifier(req));
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { id } = await props.params;
  const app = await findMyApplication(me.id, id);
  if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  const { action } = await req.json().catch(() => ({}));
  if (action === 'withdraw') {
    if (!app.withdrawnAt) await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { withdrawnAt: new Date() } });
    return NextResponse.json({ success: true });
  }
  if (action === 'delete') {
    await eraseApplication(app.id);
    return NextResponse.json({ success: true, deleted: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
