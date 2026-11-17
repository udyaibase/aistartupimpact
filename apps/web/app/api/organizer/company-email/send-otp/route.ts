import { NextRequest, NextResponse } from 'next/server';
import { accountCodeRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { prisma } from '@udyaibase/database';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { createOtp } from '@/lib/otp';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { isDisposableEmail, isFreeEmailProvider, companyEmailOtpHtml, extractEmailDomain } from '@udyaibase/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getOrganizerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
    }
    // Codes are limited per address already; this also limits one account sending codes to many addresses.
    const { success: allowed, reset } = await checkRateLimit(accountCodeRateLimit, `organizer-company-email:${session.id}`);
    if (!allowed) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

    const { companyEmail } = await request.json();

    if (!companyEmail || typeof companyEmail !== 'string' || companyEmail.length > 255 || !companyEmail.includes('@') || !companyEmail.split('@')[1]?.includes('.')) {
      return NextResponse.json({ success: false, error: 'A valid email address is required.' }, { status: 400 });
    }

    const emailLower = companyEmail.toLowerCase().trim();

    if (isDisposableEmail(emailLower)) {
      return NextResponse.json({ success: false, error: 'Disposable email addresses are not allowed.' }, { status: 400 });
    }

    if (isFreeEmailProvider(emailLower)) {
      return NextResponse.json({ success: false, error: 'Please use your company email address, not a personal email (e.g. Gmail, Yahoo).' }, { status: 400 });
    }

    const { otp, error } = await createOtp(emailLower, 'company_email_verify');
    if (!otp) {
      return NextResponse.json({ success: false, error: error || 'Failed to send code.' }, { status: 429 });
    }

    await prisma.eventOrganizer.update({
      where: { id: session.id },
      data: { companyEmail: emailLower, companyEmailVerified: false, companyEmailVerifiedAt: null },
    });

    sendEmailFireAndForget({
      to: emailLower,
      subject: 'Verify your company email — Udyaibase',
      html: companyEmailOtpHtml(session.name, otp),
      type: 'company_email_otp',
    });

    return NextResponse.json({ success: true, message: 'Verification code sent to your company email.' });
  } catch (err: any) {
    console.error('Organizer company email send-otp error:', err);
    return NextResponse.json({ success: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
