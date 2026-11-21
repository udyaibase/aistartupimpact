import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { prisma } from '@udyaibase/database';
import { founderApi } from '@/lib/founder/api-session';
import { verifyOtp } from '@/lib/otp';
import { extractEmailDomain } from '@udyaibase/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { success: withinLimit } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const { code } = await request.json();

    if (!code || code.length !== 6) {
      return NextResponse.json({ success: false, error: 'A 6-digit code is required.' }, { status: 400 });
    }

    const founder = await prisma.founderUser.findUnique({
      where: { id: session.userId },
      select: { companyEmail: true },
    });

    if (!founder?.companyEmail) {
      return NextResponse.json({ success: false, error: 'No company email to verify. Please send a code first.' }, { status: 400 });
    }

    const { valid, error } = await verifyOtp(founder.companyEmail, code, 'company_email_verify');
    if (!valid) {
      return NextResponse.json({ success: false, error: error || 'Invalid code.' }, { status: 400 });
    }

    await prisma.founderUser.update({
      where: { id: session.userId },
      data: {
        companyEmailVerified: true,
        companyEmailVerifiedAt: new Date(),
        companyDomain: extractEmailDomain(founder.companyEmail),
      },
    });

    return NextResponse.json({ success: true, message: 'Company email verified! You now have a Verified badge.' });
  } catch (err: any) {
    console.error('Company email verify error:', err);
    return NextResponse.json({ success: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
