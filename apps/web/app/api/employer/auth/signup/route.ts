import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Password signup is closed: new employers sign up with an email code at /employer/signup (POST /api/employer/signup). */
export async function POST() {
  return NextResponse.json({ error: 'Sign up with a code sent to your work email at /employer/signup.', useCodeSignup: true }, { status: 410 });
}
