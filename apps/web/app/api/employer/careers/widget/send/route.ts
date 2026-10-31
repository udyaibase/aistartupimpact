import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { embedSendInstructionsRateLimit } from '@/lib/event-rate-limit';
import { sendDeveloperInstructions } from '@/lib/embed/emails';
import { ensureCareersWidget } from '@/lib/jobs/careers';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

/** Emails the careers widget code and platform steps to the employer's developer. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ success: false, error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'widget.manage')) return forbidden();

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
  }
  const limit = await checkRateLimit(embedSendInstructionsRateLimit, `employer:${session.id}`);
  if (!limit.success) return NextResponse.json({ success: false, error: "You've sent a lot of these in the last hour. Try again later." }, { status: 429 });

  const [widget, employer] = await Promise.all([
    ensureCareersWidget(session.id),
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { companyName: true, email: true } }),
  ]);
  const sent = await sendDeveloperInstructions({
    kind: 'jobs',
    to: email,
    widgetId: widget.id,
    platformId: typeof body.platform === 'string' ? body.platform : widget.platform,
    organizerName: employer?.companyName ?? session.companyName,
    organizerEmail: employer?.email ?? session.email,
    note: typeof body.note === 'string' ? body.note : undefined,
  });
  if (!sent.success) return NextResponse.json({ success: false, error: "We couldn't send the email. Copy the code and share it another way." }, { status: 502 });
  return NextResponse.json({ success: true });
}
