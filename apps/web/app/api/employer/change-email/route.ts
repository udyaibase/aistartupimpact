import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireEmployerAuth } from '@/lib/employer-auth';
import { sendEmailFireAndForget } from '@/lib/email/send';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { changeEmailSchema, validateInput } from '@/lib/validation';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();
    const body = await request.json();
    const validation = validateInput(changeEmailSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const { newEmail, password } = validation.data;
    const emailLower = newEmail.toLowerCase().trim();

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!employer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 400 });
    }

    const valid = await bcrypt.compare(password, employer.passwordHash);
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
    }

    if (employer.email === emailLower) {
      return NextResponse.json({ success: false, error: 'New email is the same as current' }, { status: 400 });
    }

    const existing = await prisma.jobBoardEmployer.findUnique({ where: { email: emailLower } });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Email is already in use' }, { status: 409 });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.jobBoardEmployer.update({
      where: { id: employer.id },
      data: { pendingEmail: emailLower, emailChangeToken: token, emailChangeTokenExpiry: expiry },
    });

    const verifyUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com'}/api/verify-email-change?token=${token}&type=employer`;

    sendEmailFireAndForget({
      to: emailLower,
      subject: 'Confirm your new email address — Udyaibase',
      html: `<p>You requested to change your email address on Udyaibase.</p>
<p>Click the link below to confirm your new email:</p>
<p><a href="${verifyUrl}">Confirm Email Change</a></p>
<p>This link expires in 24 hours. If you didn't request this, ignore this email.</p>`,
    });

    return NextResponse.json({ success: true, message: 'Verification email sent to ' + emailLower });
  } catch (error) {
    console.error('Change email error:', error);
    return NextResponse.json({ success: false, error: 'Failed to initiate email change' }, { status: 500 });
  }
}
