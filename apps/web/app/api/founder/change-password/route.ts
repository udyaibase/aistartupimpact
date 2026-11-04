import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { requireFounderAuth, setFounderSession, hashPassword } from '@/lib/founder-auth';
import { changePasswordSchema, validateInput } from '@/lib/validation';
import { logFounderActivity } from '@/lib/founder/activity';
import { accountHasPassword, confirmAccountPassword } from '@/lib/founder/account';
import { setAccountPassword } from '@/lib/auth/set-password';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const { success: withinLimit } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    const session = await requireFounderAuth();

    const body = await request.json();
    const validation = validateInput(changePasswordSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const { currentPassword, newPassword } = validation.data;

    // Checked against the password they really sign in with, which may be on another of their account records.
    const email = session.email.toLowerCase();
    if (!(await accountHasPassword(email))) {
      return NextResponse.json(
        { success: false, error: 'You sign in with Google, so there’s no password to change.' },
        { status: 400 }
      );
    }
    if (!(await confirmAccountPassword(email, currentPassword))) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Keep this device's sign-in on the public site; every other device is signed out.
    let keepWebSessionId: string | null = null;
    const userToken = (await cookies()).get('user-token')?.value;
    if (userToken) {
      try {
        const { payload } = await jwtVerify(userToken, new TextEncoder().encode(process.env.USER_JWT_SECRET!));
        keepWebSessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
      } catch { /* expired: nothing to keep */ }
    }

    await setAccountPassword(email, await hashPassword(newPassword), { keepWebSessionId });

    await setFounderSession(session.userId, session.email, session.name, session.onboardingCompleted);
    await logFounderActivity(session.userId, 'password_changed', { request });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized - Please login') {
      return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
    }
    console.error('Error changing password:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
