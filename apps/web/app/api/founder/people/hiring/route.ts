import { NextRequest, NextResponse } from 'next/server';
import { founderApi } from '@/lib/founder/api-session';
import { checkRateLimit, strictRateLimit } from '@/lib/rate-limit';
import { peopleWithAccess, removeHiringAccess } from '@/lib/people/access';

export const dynamic = 'force-dynamic';

/** Remove someone from every hiring team of this founder's startups ({ email }). They lose access at once. */
export async function DELETE(request: NextRequest) {
  const guard = await founderApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  const { success } = await checkRateLimit(strictRateLimit, `founder-people:${session.userId}`);
  if (!success) return NextResponse.json({ success: false, error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { email } = await request.json().catch(() => ({}));
  if (typeof email !== 'string' || !email.includes('@')) return NextResponse.json({ success: false, error: 'Choose a person.' }, { status: 400 });
  if (email.trim().toLowerCase() === session.email.toLowerCase()) return NextResponse.json({ success: false, error: 'You can’t remove yourself.' }, { status: 400 });
  const removed = await removeHiringAccess(session.userId, email);
  return NextResponse.json({ success: true, removed, people: await peopleWithAccess(session.userId) });
}
