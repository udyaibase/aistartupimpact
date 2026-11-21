import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { z } from 'zod';
import { storedVerifyToken, verifyTokenIssuedAt } from '@/lib/organizer-auth/verify-token';
import { checkRateLimit, emailLinkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const VERIFY_LINK_HOURS = 24;
const verifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export async function POST(request: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(emailLinkRateLimit, `founder-verify:${getClientIdentifier(request)}`);
    if (!allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const body = await request.json();
    const validated = verifySchema.parse(body);
    
    // Links are `<random>.<issued-at>`; the table holds only a hash. Older links without that form no longer work.
    const stored = storedVerifyToken(validated.token);
    const issuedAt = verifyTokenIssuedAt(validated.token);
    const users = stored ? await sql`
      SELECT id, email, name, "emailVerified", status
      FROM "FounderUser"
      WHERE "verifyToken" = ${stored}
      LIMIT 1
    ` : [];

    if (users.length === 0 || !issuedAt || Date.now() - issuedAt > VERIFY_LINK_HOURS * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: 'This verification link has expired or was already used. Ask for a new one from the sign-in page.' },
        { status: 400 }
      );
    }

    const user = users[0];
    
    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        { message: 'Email already verified. You can now login.' },
        { status: 200 }
      );
    }
    
    // Update user - verify email and activate account using raw SQL
    await sql`
      UPDATE "FounderUser"
      SET "emailVerified" = true,
          "verifyToken" = NULL,
          status = 'ACTIVE',
          "updatedAt" = NOW()
      WHERE id = ${user.id}
    `;
    
    return NextResponse.json({
      success: true,
      message: 'Email verified successfully! You can now login.'
    });
    
  } catch (error: any) {
    console.error('Verification error:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid verification token' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}
