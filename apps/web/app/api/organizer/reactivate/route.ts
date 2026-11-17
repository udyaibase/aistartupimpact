import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { createOrganizerSession, verifyPassword, findOrganizerByEmail } from '@/lib/organizer-auth';
import { organizerChallengeToken } from '@/lib/organizer-auth/challenge';
import { isTwoFactorOn } from '@/lib/auth/account-two-factor';
import { checkRateLimit, getClientIdentifier, strictRateLimit, loginFailureRateLimit, failuresUsedUp } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const organizer = await findOrganizerByEmail(String(email));

    if (!organizer || !organizer.passwordHash || !organizer.deactivatedAt) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Same lockout as sign-in, so this route can't be used to guess a password without limit.
    if (organizer.lockedUntil && organizer.lockedUntil > new Date()) {
      return NextResponse.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 });
    }

    // Shares the sign-in route's counters: a pause per account and network, and a high account-wide backstop.
    const failureKey = `organizer:${organizer.id}:${identifier}`;
    if (await failuresUsedUp(loginFailureRateLimit, failureKey)) {
      return NextResponse.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 });
    }

    const valid = await verifyPassword(String(password), organizer.passwordHash);
    if (!valid) {
      await checkRateLimit(loginFailureRateLimit, failureKey);
      const attempts = (organizer.failedLoginAttempts || 0) + 1;
      await prisma.eventOrganizer.update({
        where: { id: organizer.id },
        data: { failedLoginAttempts: attempts, ...(attempts >= 20 ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {}) },
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (organizer.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Account is suspended. Contact support.' }, { status: 403 });
    }
    if (!organizer.emailVerified) {
      return NextResponse.json({ error: 'Confirm your email first, then sign in.' }, { status: 403 });
    }

    await prisma.eventOrganizer.update({
      where: { id: organizer.id },
      data: { deactivatedAt: null, deletionScheduledAt: null, lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });
    await logOrganizerActivity(organizer.id, 'account_reactivated', { actor: { name: organizer.name, email: organizer.email }, request });

    // With 2FA on, the session starts only after the code (POST /api/organizer/auth/verify-2fa).
    if (await isTwoFactorOn(organizer.email)) {
      return NextResponse.json({ success: false, requires2FA: true, challengeToken: await organizerChallengeToken(organizer.id), message: 'Account reactivated. Enter your 2FA code to sign in.' });
    }

    await createOrganizerSession(organizer.id);

    return NextResponse.json({
      success: true,
      message: 'Account reactivated. Your draft events remain as drafts — you can republish from your dashboard.',
    });
  } catch (error) {
    console.error('Organizer reactivation error:', error);
    return NextResponse.json({ error: 'Reactivation failed' }, { status: 500 });
  }
}
