import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { checkDomainCode } from '@/lib/startups/domain-otp';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'auth/verify-otp', 'sensitive');
  if (limited) return limited;
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email?.trim() || !code?.trim()) {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
    }

    // Same check as every other emailed code (3 attempts, counted safely, used once).
    const r = await checkDomainCode({ email: email.toLowerCase().trim(), purpose: 'employer_signup', code: code.trim() });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

    // Mark employer as email verified
    await sql`
      UPDATE "JobBoardEmployer" SET "emailVerified" = true, "updatedAt" = NOW()
      WHERE email = ${email.toLowerCase().trim()}
    `;

    return NextResponse.json({ success: true, verified: true });
  } catch (error: any) {
    console.error('[POST /api/employer/auth/verify-otp]', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
