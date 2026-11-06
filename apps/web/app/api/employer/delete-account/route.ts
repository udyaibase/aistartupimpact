import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireEmployerAuth, clearEmployerSession } from '@/lib/employer-auth';
import { writeLimited } from '@/lib/employer/write-limit';
import { can, forbidden } from '@/lib/employer/permissions';
import { refreshSections } from '@/lib/revalidate';
import { checkActionCode } from '@/lib/employer/account-action';
import { eraseWorkspace } from '@/lib/employer/erase-workspace';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    // Wrong codes are limited by the code check, and the send step counts separately.
    const limited = await writeLimited(request, 'delete-account', 'sensitive');
    if (limited) return limited;

    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();

    const body = await request.json().catch(() => ({}));
    const check = await checkActionCode(session.email, (body as { code?: unknown }).code);
    if (!check.ok) return NextResponse.json({ success: false, error: check.error }, { status: check.status });

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { id: true, email: true },
    });
    if (!employer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    await eraseWorkspace(employer.id, employer.email);

    await clearEmployerSession();
    refreshSections(['jobs', 'startups', 'home']);

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'EMPLOYER_AUTH_REQUIRED') {
      return NextResponse.json({ success: false, error: 'Please log in again.' }, { status: 401 });
    }
    console.error('Error deleting employer account:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
