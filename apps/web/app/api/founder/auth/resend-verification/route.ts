import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { newVerifyToken } from '@/lib/organizer-auth/verify-token';
import { sendVerificationEmail } from '@/lib/founder-email';
import { z } from 'zod';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const resendSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success: allowed } = await checkRateLimit(authRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const validated = resendSchema.parse(body);
    
    // Find user
    const users = await sql`
      SELECT id, email, name, "emailVerified", status
      FROM "FounderUser"
      WHERE email = ${validated.email.toLowerCase()}
      LIMIT 1
    `;
    
    if (users.length === 0) {
      // Don't reveal if email exists or not for security
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, a verification link has been sent.'
      });
    }
    
    const user = users[0];
    
    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json({
        success: true,
        message: 'This email is already verified. You can login now.'
      });
    }
    
    // Generate new verification token
    // The email carries the link; the table keeps only its hash and issue time (it works for 24 hours).
    const { link: verifyToken, stored } = newVerifyToken();
    
    // Update user with new token
    await sql`
      UPDATE "FounderUser"
      SET "verifyToken" = ${stored}, "updatedAt" = NOW()
      WHERE id = ${user.id}
    `;
    
    // Send verification email
    try {
      await sendVerificationEmail(user.email, user.name, verifyToken);
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again later.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Verification email sent! Please check your inbox.'
    });
    
  } catch (error: any) {
    console.error('Resend verification error:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: error.errors[0]?.message || 'Invalid email address' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to resend verification email. Please try again.' },
      { status: 500 }
    );
  }
}
