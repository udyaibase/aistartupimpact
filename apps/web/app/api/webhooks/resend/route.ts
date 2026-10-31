import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { resendSignatureValid, suppressionReason } from '@/lib/email/resend-webhook';

export const dynamic = 'force-dynamic';

/**
 * Resend delivery webhook (replaces the retired apps/api /v1/webhooks/resend).
 * Hard bounces and spam complaints unsubscribe the address from newsletters and event campaigns,
 * which protects the sending domain's reputation. Account logins are never touched.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const valid = resendSignatureValid(raw, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  });
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let event: { type?: string; data?: { to?: string[]; bounce?: { type?: string } } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad payload' }, { status: 400 }); }

  const reason = suppressionReason(event);
  const emails = (event.data?.to ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  if (!reason || emails.length === 0) return NextResponse.json({ status: 'ignored' });

  const now = new Date();
  const [newsletter, events] = await Promise.all([
    prisma.newsletterSubscriber.updateMany({
      where: { email: { in: emails, mode: 'insensitive' }, isActive: true },
      data: { isActive: false, unsubscribedAt: now },
    }),
    prisma.eventSubscriber.updateMany({
      where: { email: { in: emails, mode: 'insensitive' }, subscribed: true },
      data: { subscribed: false, unsubscribedAt: now },
    }),
  ]);
  return NextResponse.json({ status: 'suppressed', reason, newsletter: newsletter.count, events: events.count });
}
