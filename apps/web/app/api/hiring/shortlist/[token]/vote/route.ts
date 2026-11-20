import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { castVote } from '@/lib/employer/shortlist-share';

export const dynamic = 'force-dynamic';

/** A vote from a shared shortlist link (no account; the link is the key). */
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { success } = await checkRateLimit(applicationStatusRateLimit, `shortlist-vote:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  const { token } = await props.params;
  const b = await request.json().catch(() => ({}));
  const r = await castVote(token, String(b.applicationId ?? ''), b.vote, b.comment);
  if (r === 'gone') return NextResponse.json({ error: 'This link has expired or was turned off.' }, { status: 410 });
  if (r === 'invalid') return NextResponse.json({ error: 'That vote couldn’t be saved.' }, { status: 400 });
  return NextResponse.json({ success: true });
}
