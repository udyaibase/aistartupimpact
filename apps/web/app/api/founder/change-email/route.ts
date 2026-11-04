import { NextRequest, NextResponse } from 'next/server';
import { confirmAccountPassword } from '@/lib/founder/account';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { logFounderActivity } from '@/lib/founder/activity';
import { prisma } from '@udyaibase/database';
import { requireFounderAuth } from '@/lib/founder-auth';
import { sendEmailFireAndForget } from '@/lib/email/send';
import crypto from 'crypto';
import { changeEmailSchema, validateInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { success: withinLimit } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    const session = await requireFounderAuth();
    const body = await request.json();
    const validation = validateInput(changeEmailSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const { newEmail, password } = validation.data;
    const emailLower = newEmail.toLowerCase().trim();

const user = await prisma.founderUser.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 400 });
    }

    // The password they really sign in with, which may be on another of their account records. Google accounts have none.
    if (!(await confirmAccountPassword(user.email.toLowerCase(), password))) {
      return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
    }

    if (user.email === emailLower) {
      return NextResponse.json({ success: false, error: 'New email is the same as current' }, { status: 400 });
    }

    const [takenFounder, takenWeb, takenUnified, takenHost] = await Promise.all([
      prisma.founderUser.findUnique({ where: { email: emailLower }, select: { id: true } }),
      prisma.webUser.findUnique({ where: { email: emailLower }, select: { id: true } }),
      prisma.unifiedUser.findUnique({ where: { email: emailLower }, select: { id: true } }),
      prisma.eventOrganizer.findFirst({ where: { email: emailLower }, select: { id: true } }),
    ]);
    if (takenFounder || takenWeb || takenUnified || takenHost) {
      return NextResponse.json({ success: false, error: 'Email is already in use' }, { status: 409 });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.founderUser.update({
      where: { id: user.id },
      data: { pendingEmail: emailLower, emailChangeToken: token, emailChangeTokenExpiry: expiry },
    });

    const verifyUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com'}/api/verify-email-change?token=${token}&type=founder`;

    sendEmailFireAndForget({
      to: emailLower,
      subject: 'Confirm your new email address — Udyaibase',
      html: `<p>You requested to change your email address on Udyaibase.</p>
<p>Click the link below to confirm your new email:</p>
<p><a href="${verifyUrl}">Confirm Email Change</a></p>
<p>This link expires in 24 hours. If you didn't request this, ignore this email.</p>`,
    });

    await logFounderActivity(session.userId, 'email_change_requested', { request });
    return NextResponse.json({ success: true, message: 'Verification email sent to ' + emailLower });
  } catch (error) {
    console.error('Change email error:', error);
    return NextResponse.json({ success: false, error: 'Failed to initiate email change' }, { status: 500 });
  }
}
