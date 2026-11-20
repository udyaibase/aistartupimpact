import { NextRequest, NextResponse } from 'next/server';
import { setFounderSession } from '@/lib/founder-auth';
import { founderAccountForHiringSession } from '@/lib/people/access';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** From the hiring portal to the founder portal for the same person (never for accounts with two-step sign-in). */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'switch-founder', 'sensitive');
  if (limited) return limited;
  const guard = await employerApi();
  if (guard.error) return guard.error;
  const session = guard.session;
  const f = await founderAccountForHiringSession(session);
  if (!f) return NextResponse.json({ success: false, error: 'Sign in to the founder portal with your founder account.', redirect: '/founder/login' }, { status: 403 });
  await setFounderSession(f.id, f.email, f.name, f.onboardingCompleted);
  return NextResponse.json({ success: true, redirect: '/founder/dashboard' });
}
