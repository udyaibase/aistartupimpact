import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { prisma } from '@udyaibase/database';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body;
    if (!body.turnstileToken) {
      return NextResponse.json({ error: 'CAPTCHA verification required. Please complete the challenge.' }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ error: 'Human verification failed. Please try again.' }, { status: 403 });
    }

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain an uppercase letter' }, { status: 400 });
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain a lowercase letter' }, { status: 400 });
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain a number' }, { status: 400 });
    }

    // Find user by reset token
    const user = await prisma.founderUser.findFirst({
      where: {
        resetToken: token,
        resetExpiry: {
          gt: new Date(), // Token not expired
        },
      },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await prisma.founderUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetExpiry: null,
        updatedAt: new Date(),
      },
    });

    // Invalidate related sessions across auth systems
    await sql`DELETE FROM "WebUserSession" WHERE "webUserId" IN (SELECT id FROM "WebUser" WHERE email = ${user.email.toLowerCase()})`;
    await sql`DELETE FROM "UnifiedSession" WHERE "userId" IN (SELECT id FROM "UnifiedUser" WHERE email = ${user.email.toLowerCase()})`;
    await sql`DELETE FROM "EventOrganizerSession" WHERE "organizerId" IN (SELECT id FROM "EventOrganizer" WHERE email = ${user.email.toLowerCase()})`;

    const response = NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
    response.cookies.delete('founder-token');
    response.cookies.delete('user-token');
    response.cookies.delete('unified_session');
    return response;
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
