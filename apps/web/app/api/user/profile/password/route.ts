import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { setFounderSession } from '@/lib/founder-auth';
import { setAccountPassword } from '@/lib/auth/set-password';
import { logFounderActivity } from '@/lib/founder/activity';

export const dynamic = 'force-dynamic';

const JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('user-token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const verified = await jwtVerify(token, JWT_SECRET);
    const userId = (verified.payload as any).userId;
    const email = (verified.payload as any).email;
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
    }

    // Get current user
    const users = await sql`
      SELECT "passwordHash" FROM "WebUser" WHERE id = ${userId} LIMIT 1
    `;
    if (users.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const user = users[0];

    // If user has a password, verify current password
    if (user.passwordHash) {
      if (!currentPassword) return NextResponse.json({ error: 'Current password required' }, { status: 400 });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Hash and update
    const newHash = await bcrypt.hash(newPassword, 12);

    const currentSessionId = (verified.payload as any).sessionId;

    // Everywhere it's stored; this device stays signed in, every other one is signed out.
    const founder = await setAccountPassword(email, newHash, { keepWebSessionId: currentSessionId });
    if (founder) {
      await setFounderSession(founder.id, founder.email, founder.name, founder.onboardingCompleted);
      await logFounderActivity(founder.id, 'password_changed', { request });
    }

    return NextResponse.json({ success: true, message: 'Password updated. Other sessions have been signed out.' });
  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
