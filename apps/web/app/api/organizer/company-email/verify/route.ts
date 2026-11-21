import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { verifyOtp } from '@/lib/otp';
import { extractEmailDomain } from '@udyaibase/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getOrganizerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
    }
    const limited = await hostWriteLimit(session.id);
    if (limited) return limited;

    const { code } = await request.json();

    if (!code || code.length !== 6) {
      return NextResponse.json({ success: false, error: 'A 6-digit code is required.' }, { status: 400 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { id: session.id },
      select: { companyEmail: true },
    });

    if (!organizer?.companyEmail) {
      return NextResponse.json({ success: false, error: 'No company email to verify. Please send a code first.' }, { status: 400 });
    }

    const { valid, error } = await verifyOtp(organizer.companyEmail, code, 'company_email_verify');
    if (!valid) {
      return NextResponse.json({ success: false, error: error || 'Invalid code.' }, { status: 400 });
    }

    await prisma.eventOrganizer.update({
      where: { id: session.id },
      data: {
        companyEmailVerified: true,
        companyEmailVerifiedAt: new Date(),
        companyDomain: extractEmailDomain(organizer.companyEmail),
      },
    });

    return NextResponse.json({ success: true, message: 'Company email verified! You now have a Verified badge.' });
  } catch (err: any) {
    console.error('Organizer company email verify error:', err);
    return NextResponse.json({ success: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
