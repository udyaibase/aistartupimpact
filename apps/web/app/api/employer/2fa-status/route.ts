import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { passwordSignInOpen } from '@/lib/employer/sign-in-policy';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const guard = await employerApi('account.manage');
    if (guard.error) return guard.error;
    const session = guard.session;
    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { twoFactorEnabled: true, passwordHash: true },
    });

    if (!employer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // A real password is a bcrypt hash; accounts that sign in by email code hold a marker instead.
    const hasPassword = employer.passwordHash.startsWith('$2') && passwordSignInOpen();
    return NextResponse.json({ success: true, enabled: employer.twoFactorEnabled, hasPassword });
  } catch (error) {
    console.error('Employer 2FA status error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch 2FA status' }, { status: 500 });
  }
}
