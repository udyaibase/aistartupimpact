import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireEmployerAuth } from '@/lib/employer-auth';
import { verifyTOTPToken, decryptSecret } from '@/lib/two-factor';
import { can, forbidden } from '@/lib/employer/permissions';
import { TWO_FACTOR_LOCKED_MESSAGE, clearTwoFactorFailures, isTwoFactorLocked, recordTwoFactorFailure } from '@/lib/auth/two-factor-attempts';
import { twoFactorRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(twoFactorRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ success: false, error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ success: false, error: 'Verification code is required' }, { status: 400 });
    }

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!employer || !employer.twoFactorEnabled || !employer.twoFactorSecret) {
      return NextResponse.json({ success: false, error: '2FA is not enabled' }, { status: 400 });
    }

    if (await isTwoFactorLocked('employer', session.id)) {
      return NextResponse.json({ success: false, error: TWO_FACTOR_LOCKED_MESSAGE }, { status: 429 });
    }

    const secret = decryptSecret(employer.twoFactorSecret);
    if (!verifyTOTPToken(token, secret)) {
      const locked = await recordTwoFactorFailure('employer', session.id);
      return NextResponse.json(
        { success: false, error: locked ? TWO_FACTOR_LOCKED_MESSAGE : 'Invalid verification code' },
        { status: locked ? 429 : 400 },
      );
    }
    await clearTwoFactorFailures('employer', session.id);

    await prisma.jobBoardEmployer.update({
      where: { id: session.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
    });

    return NextResponse.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    console.error('Employer 2FA disable error:', error);
    return NextResponse.json({ success: false, error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
