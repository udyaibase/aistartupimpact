import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, apiRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { deleteSourced, markInterested, sourcedByToken } from '@/lib/employer/sourcing';

export const dynamic = 'force-dynamic';

/** From the first-contact email (button press on our page, never a bare link): I'm interested, or remove my details. */
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { success } = await checkRateLimit(apiRateLimit, `sourced:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { token } = await props.params;
  const a = await sourcedByToken(token);
  if (!a) return NextResponse.json({ error: 'This link no longer works.' }, { status: 404 });
  const { action } = await request.json().catch(() => ({}));
  if (action === 'interested') {
    if (a.sourcedState === 'INTERESTED') return NextResponse.json({ success: true, already: true });
    await markInterested({ id: a.id, actor: 'candidate' });
    return NextResponse.json({ success: true });
  }
  if (action === 'remove') {
    if (a.sourcedState === 'INTERESTED') return NextResponse.json({ error: 'You’re already talking with this team. Reply to their email to withdraw.' }, { status: 409 });
    await deleteSourced(a.id);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
