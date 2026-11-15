import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { leavePool, verifyPoolToken } from '@/lib/jobs/talent-pool';

export const dynamic = 'force-dynamic';

/**
 * One-click "leave the talent pool" from the List-Unsubscribe header (Gmail, Outlook and Apple Mail POST here).
 * The link in the email body opens /talent-pool instead, which asks for a button press.
 */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(applicationStatusRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const t = url.searchParams.get('t') ?? '';
  if (!verifyPoolToken(id, 'leave', t)) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
  await leavePool(id);
  return NextResponse.json({ ok: true });
}
