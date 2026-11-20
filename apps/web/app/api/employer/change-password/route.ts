import { NextRequest, NextResponse } from 'next/server';
import { passwordProblem } from "@/lib/password-rules";
import { prisma } from '@udyaibase/database';
import bcrypt from 'bcryptjs';
import { sessionCutoff, setEmployerSession } from '@/lib/employer-auth';
import { changePasswordSchema, validateInput } from '@/lib/validation';
import { passwordSignInOpen } from '@/lib/employer/sign-in-policy';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerActor, logEmployerActivity } from '@/lib/workspace-activity';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const limited = await writeLimited(request, 'change-password', 'sensitive');
    if (limited) return limited;

    const guard = await employerApi('account.manage');
    if (guard.error) return guard.error;
    const session = guard.session;
    if (!passwordSignInOpen()) {
      return NextResponse.json({ success: false, error: 'Password sign-in has ended. You sign in with an email code now.' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateInput(changePasswordSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const { currentPassword, newPassword } = validation.data;
    const pwProblem = passwordProblem(newPassword, null, 'mixed'); // also rejects common passwords
    if (pwProblem) return NextResponse.json({ success: false, error: pwProblem }, { status: 400 });

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

    await logEmployerActivity(session.id, 'password_changed', { actor: employerActor(session), request });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employer change password error:', error);
    return NextResponse.json({ success: false, error: 'Failed to change password' }, { status: 500 });
  }
}
