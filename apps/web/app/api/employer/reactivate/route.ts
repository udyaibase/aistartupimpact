import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import bcrypt from 'bcryptjs';
import { setEmployerSession } from '@/lib/employer-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { logEmployerActivity } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, companyName: true, slug: true, plan: true, passwordHash: true, deactivatedAt: true, isActive: true, onboardingCompleted: true },
    });

    if (!employer) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!employer.isActive) {
      return NextResponse.json({ error: 'Account is suspended. Contact support.' }, { status: 403 });
    }

    if (!employer.deactivatedAt) {
      return NextResponse.json({ error: 'Account is not deactivated' }, { status: 400 });
    }

    const valid = await bcrypt.compare(password, employer.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.jobBoardEmployer.update({
      where: { id: employer.id },
      data: { deactivatedAt: null, lastLoginAt: new Date() },
    });
    await logEmployerActivity(employer.id, 'account_reactivated', { actor: { name: employer.companyName, email: employer.email }, request });

    await setEmployerSession({
      id: employer.id,
      email: employer.email,
      companyName: employer.companyName,
      slug: employer.slug,
      plan: employer.plan,
      onboardingCompleted: employer.onboardingCompleted,
    });

    return NextResponse.json({
      success: true,
      message: 'Account reactivated. Your closed job listings remain closed — you can repost from your dashboard.',
    });
  } catch (error) {
    console.error('Employer reactivation error:', error);
    return NextResponse.json({ error: 'Reactivation failed' }, { status: 500 });
  }
}
