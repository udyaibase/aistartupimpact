import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import bcrypt from 'bcryptjs';
import { requireEmployerAuth, sessionCutoff, setEmployerSession } from '@/lib/employer-auth';
import { changePasswordSchema, validateInput } from '@/lib/validation';
import { can, forbidden } from '@/lib/employer/permissions';
import { passwordSignInOpen } from '@/lib/employer/sign-in-policy';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
    if (!allowed) return NextResponse.json({ success: false, error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();
    if (!passwordSignInOpen()) {
      return NextResponse.json({ success: false, error: 'Password sign-in has ended. You sign in with an email code now.' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateInput(changePasswordSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const { currentPassword, newPassword } = validation.data;

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, companyName: true, slug: true, plan: true, onboardingCompleted: true, passwordHash: true },
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
      data: { passwordHash: hash, sessionsValidAfter: sessionCutoff() },
    });
    // Signs out every other device; this one continues on a fresh session.
    await setEmployerSession(employer, session.memberId ? { id: session.memberId, email: session.email } : undefined);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employer change password error:', error);
    return NextResponse.json({ success: false, error: 'Failed to change password' }, { status: 500 });
  }
}
