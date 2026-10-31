import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { eraseApplication, findByStatusToken } from '@/lib/jobs/candidate-status';

export const dynamic = 'force-dynamic';

/** Candidate actions from the private status link: withdraw, or delete my data. */
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const { success } = await checkRateLimit(applicationStatusRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const app = await findByStatusToken(token);
  if (!app) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
  const { action } = await request.json().catch(() => ({}));

  if (action === 'withdraw') {
    if (!app.withdrawnAt) await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { withdrawnAt: new Date() } });
    return NextResponse.json({ success: true });
  }
  if (action === 'delete') {
    await eraseApplication(app.id);
    return NextResponse.json({ success: true, deleted: true });
  }
  if (action === 'pool_on' || action === 'pool_off') {
    if (app.fullName === 'Deleted applicant') return NextResponse.json({ error: 'This application was deleted.' }, { status: 410 });
    await prisma.jobBoardApplication.update({
      where: { id: app.id },
      data: { talentPoolUntil: action === 'pool_on' ? new Date(Date.now() + 365 * 864e5) : null },
    });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
