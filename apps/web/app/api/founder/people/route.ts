import { NextResponse } from 'next/server';
import { getFounderSession } from '@/lib/founder-auth';
import { peopleWithAccess } from '@/lib/people/access';

export const dynamic = 'force-dynamic';

/** Everyone with access to this founder's startups: founder team and every hiring team, joined by email. */
export async function GET() {
  const session = await getFounderSession();
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  return NextResponse.json({ success: true, people: await peopleWithAccess(session.userId) });
}
