import { NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { founderApi } from '@/lib/founder/api-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const founder = await prisma.founderUser.findUnique({
      where: { id: session.userId },
      select: { companyEmail: true, companyEmailVerified: true, companyEmailVerifiedAt: true, companyDomain: true },
    });

    if (!founder) {
      return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      companyEmail: founder.companyEmail,
      companyEmailVerified: founder.companyEmailVerified,
      companyEmailVerifiedAt: founder.companyEmailVerifiedAt,
      companyDomain: founder.companyDomain,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
