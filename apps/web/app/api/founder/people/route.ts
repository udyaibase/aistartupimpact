import { NextResponse } from 'next/server';
import { founderApi } from '@/lib/founder/api-session';
import { peopleWithAccess } from '@/lib/people/access';

export const dynamic = 'force-dynamic';

/** Everyone with access to this founder's startups: founder team and every hiring team, joined by email. */
export async function GET() {
  const guard = await founderApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  return NextResponse.json({ success: true, people: await peopleWithAccess(session.userId) });
}
