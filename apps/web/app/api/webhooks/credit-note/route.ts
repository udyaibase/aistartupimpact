import { NextRequest, NextResponse } from 'next/server';
import { emailCreditNote, invoicesEnabled } from '@/lib/billing/invoice';
import { internalAuthorized } from '@/lib/internal-auth';

export const dynamic = 'force-dynamic';

/**
 * Called by the admin app right after it records a refund: { table: 'employer' | 'organizer', paymentId }.
 * Issues the GST credit note and emails it. The daily cron catches any call that didn't arrive.
 */
export async function POST(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { table, paymentId } = await request.json().catch(() => ({}));
  if ((table !== 'employer' && table !== 'organizer') || typeof paymentId !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (!invoicesEnabled()) return NextResponse.json({ skipped: 'invoices_off' });
  const r = await emailCreditNote(table, paymentId);
  return r.ok ? NextResponse.json({ sent: true, to: r.to }) : NextResponse.json({ error: r.error }, { status: 409 });
}
