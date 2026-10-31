import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireEmployerAuth } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();
    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { twoFactorEnabled: true },
    });

    if (!employer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, enabled: employer.twoFactorEnabled });
  } catch (error) {
    console.error('Employer 2FA status error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch 2FA status' }, { status: 500 });
  }
}
