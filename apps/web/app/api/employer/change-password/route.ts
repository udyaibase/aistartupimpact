import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import bcrypt from 'bcryptjs';
import { requireEmployerAuth } from '@/lib/employer-auth';
import { changePasswordSchema, validateInput } from '@/lib/validation';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();

    const body = await request.json();
    const validation = validateInput(changePasswordSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const { currentPassword, newPassword } = validation.data;

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { passwordHash: true },
    });

    if (!employer?.passwordHash) {
      return NextResponse.json({ success: false, error: 'No password set' }, { status: 400 });
    }

    const valid = await bcrypt.compare(currentPassword, employer.passwordHash);
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 401 });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.jobBoardEmployer.update({
      where: { id: session.id },
      data: { passwordHash: hash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employer change password error:', error);
    return NextResponse.json({ success: false, error: 'Failed to change password' }, { status: 500 });
  }
}
