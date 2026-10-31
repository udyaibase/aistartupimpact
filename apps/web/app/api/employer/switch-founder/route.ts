import { NextResponse } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';
import { setFounderSession } from '@/lib/founder-auth';
import { founderAccountForHiringSession } from '@/lib/people/access';

export const dynamic = 'force-dynamic';

/** From the hiring portal to the founder portal for the same person (never for accounts with two-step sign-in). */
export async function POST() {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  const f = await founderAccountForHiringSession(session);
  if (!f) return NextResponse.json({ success: false, error: 'Sign in to the founder portal with your founder account.', redirect: '/founder/login' }, { status: 403 });
  await setFounderSession(f.id, f.email, f.name, f.onboardingCompleted);
  return NextResponse.json({ success: true, redirect: '/founder/dashboard' });
}
