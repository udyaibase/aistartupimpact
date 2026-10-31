import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { sql } from '@/lib/db';
import { setEmployerSession } from '@/lib/employer-auth';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { checkDomainCode } from '@/lib/startups/domain-otp';
import { sendMemberLoginCode } from '@/lib/employer/team';

export const dynamic = 'force-dynamic';

const PURPOSE = 'employer_member_login';

/**
 * Passwordless sign-in for teammates. { step: 'send', email } then { step: 'verify', email, code, employerId? }.
 * "send" always answers the same way so it can't be used to discover who is on a team.
 */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(authRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });

  const b = await request.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });

  const memberships = await prisma.jobBoardTeamMember.findMany({
    where: { email, status: 'ACTIVE', Employer: { isActive: true, deactivatedAt: null } },
    include: { Employer: { select: { id: true, email: true, companyName: true, slug: true, plan: true } } },
  });

  if (b.step !== 'verify') {
    if (memberships.length) {
      const recent = await sql`SELECT EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int AS age FROM "EmailOtp" WHERE email = ${email} AND purpose = ${PURPOSE} ORDER BY "createdAt" DESC LIMIT 1`;
      const age = (recent[0] as { age: number } | undefined)?.age;
      if (age === undefined || age >= 60) {
        const code = crypto.randomInt(100000, 1000000).toString();
        await sql`DELETE FROM "EmailOtp" WHERE email = ${email} AND purpose = ${PURPOSE}`;
        await sql`INSERT INTO "EmailOtp" (id, email, code, purpose, "expiresAt", "createdAt")
          VALUES (gen_random_uuid()::text, ${email}, ${crypto.createHash('sha256').update(code).digest('hex')}, ${PURPOSE}, ${new Date(Date.now() + 600_000).toISOString()}::timestamp, NOW())`;
        await sendMemberLoginCode(email, code);
      }
    }
    return NextResponse.json({ success: true, message: 'If this email is on a hiring team, we sent it a 6-digit code.' });
  }

  const code = String(b.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code from the email.' }, { status: 400 });
  if (!memberships.length) return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 });

  // Several workspaces: verify the code first, then let them choose (the code stays valid for the choice).
  const chosen = memberships.length === 1 ? memberships[0] : memberships.find((m) => m.employerId === b.employerId);
  if (!chosen) {
    const peek = await sql`SELECT code FROM "EmailOtp" WHERE email = ${email} AND purpose = ${PURPOSE} AND verified = false AND "expiresAt" > NOW() ORDER BY "createdAt" DESC LIMIT 1`;
    const stored = (peek[0] as { code: string } | undefined)?.code;
    const hashed = crypto.createHash('sha256').update(code).digest('hex');
    if (!stored || stored.length !== hashed.length || !crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(hashed))) {
      return checkDomainCode({ email, purpose: PURPOSE, code }).then((r) => NextResponse.json({ error: r.ok ? 'Choose a workspace.' : r.error }, { status: r.ok ? 400 : r.status }));
    }
    return NextResponse.json({ choose: memberships.map((m) => ({ employerId: m.employerId, companyName: m.Employer.companyName })) });
  }

  const r = await checkDomainCode({ email, purpose: PURPOSE, code });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await prisma.jobBoardTeamMember.update({ where: { id: chosen.id }, data: { lastActiveAt: new Date() } });
  const e = chosen.Employer;
  await setEmployerSession({ id: e.id, email: e.email, companyName: e.companyName, slug: e.slug, plan: e.plan, onboardingCompleted: true }, { id: chosen.id, email: chosen.email });
  return NextResponse.json({ success: true, redirect: chosen.role === 'INTERVIEWER' ? '/employer/applications' : '/employer/dashboard' });
}
