import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { setEmployerSession } from '@/lib/employer-auth';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { hashToken } from '@/lib/employer/team';

export const dynamic = 'force-dynamic';

/** Accept a team invite: the emailed link proves the address, so no password is needed. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(authRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });

  const b = await request.json().catch(() => ({}));
  const token = String(b.token ?? '');
  const name = String(b.name ?? '').trim().slice(0, 80);
  if (!token) return NextResponse.json({ error: 'This invite link is incomplete.' }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: 'Enter your name.', field: 'name' }, { status: 400 });

  const member = await prisma.jobBoardTeamMember.findUnique({
    where: { inviteTokenHash: hashToken(token) },
    include: { Employer: { select: { id: true, email: true, companyName: true, slug: true, plan: true, isActive: true, deactivatedAt: true } } },
  });
  if (!member || member.status !== 'PENDING') return NextResponse.json({ error: 'This invite is no longer valid. Ask for a new one.' }, { status: 404 });
  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) return NextResponse.json({ error: 'This invite has expired. Ask for a new one.' }, { status: 410 });
  if (!member.Employer.isActive || member.Employer.deactivatedAt) return NextResponse.json({ error: 'This workspace is no longer active.' }, { status: 410 });

  await prisma.jobBoardTeamMember.update({
    where: { id: member.id },
    data: { status: 'ACTIVE', name, acceptedAt: new Date(), lastActiveAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
  });
  const e = member.Employer;
  await setEmployerSession({ id: e.id, email: e.email, companyName: e.companyName, slug: e.slug, plan: e.plan, onboardingCompleted: true }, { id: member.id, email: member.email });
  return NextResponse.json({ success: true, redirect: member.role === 'INTERVIEWER' ? '/employer/applications' : '/employer/dashboard' });
}
