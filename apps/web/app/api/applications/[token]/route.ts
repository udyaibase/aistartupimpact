import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { eraseApplication, findByStatusToken } from '@/lib/jobs/candidate-status';
import { leavePool, POOL_DAYS } from '@/lib/jobs/talent-pool';
import { createOtp, checkEmailCode } from '@/lib/otp';
import { sendCandidateCode } from '@/lib/jobs/candidate-emails';

const CODE_PURPOSE = 'app_action';
/** r•••@gmail.com: enough to recognise, not enough to read. */
const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, (_, a: string, d: string) => `${a}•••${d}`);

export const dynamic = 'force-dynamic';

/**
 * Candidate actions from the private status link. The link alone shows status; withdrawing or deleting also needs
 * a code sent to the application's email (a forwarded email shouldn't be enough to delete someone's application).
 *   { action: 'send_code' } → emails a code;  { action: 'withdraw' | 'delete', code }
 */
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const { success } = await checkRateLimit(applicationStatusRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const app = await findByStatusToken(token);
  if (!app) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
  const { action, code } = await request.json().catch(() => ({}));

  if (action === 'send_code') {
    if (app.fullName === 'Deleted applicant') return NextResponse.json({ error: 'This application was deleted.' }, { status: 410 });
    const { otp, error } = await createOtp(app.email, CODE_PURPOSE);
    if (!otp) return NextResponse.json({ error: error || 'Couldn’t send a code. Try again shortly.' }, { status: 429 });
    sendCandidateCode({ to: app.email, code: otp, purpose: 'app_action' });
    return NextResponse.json({ success: true, sentTo: mask(app.email) });
  }
  if (action === 'withdraw' || action === 'delete') {
    const check = /^\d{6}$/.test(String(code ?? '')) ? await checkEmailCode(app.email, CODE_PURPOSE, String(code), { whenSpent: 'delete' }) : null;
    if (!check?.ok) {
      return NextResponse.json({ error: !check ? 'Enter the 6-digit code from your email.' : check.reason === 'wrong' ? `That code isn’t right. ${check.left} ${check.left === 1 ? 'try' : 'tries'} left.` : 'That code has expired. Send a new one.', field: 'code' }, { status: 400 });
    }
  }

  if (action === 'withdraw') {
    // Nothing to withdraw from once the company has decided either way.
    if (app.status === 'REJECTED' || app.status === 'HIRED') return NextResponse.json({ error: 'This application is already closed, so there’s nothing to withdraw.' }, { status: 409 });
    if (!app.withdrawnAt) await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { withdrawnAt: new Date() } });
    return NextResponse.json({ success: true });
  }
  if (action === 'delete') {
    await eraseApplication(app.id);
    return NextResponse.json({ success: true, deleted: true });
  }
  if (action === 'pool_on' || action === 'pool_off') {
    if (app.fullName === 'Deleted applicant') return NextResponse.json({ error: 'This application was deleted.' }, { status: 410 });
    // Leaving applies to every application they sent this company; joining starts a fresh 12 months.
    if (action === 'pool_off') await leavePool(app.id);
    else await prisma.jobBoardApplication.update({ where: { id: app.id }, data: { talentPoolUntil: new Date(Date.now() + POOL_DAYS * 864e5), talentPoolReminderAt: null } });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
