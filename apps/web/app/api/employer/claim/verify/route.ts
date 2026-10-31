import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { sql } from '@/lib/db';
import { markStartupVerified } from '@/lib/startups/ownership';
import { getEmployerSession } from '@/lib/employer-auth';
import { emailDomain, emailMatchesDomain, registrableDomain, websiteDomain, VERIFIED_CLAIM_METHODS } from '@/lib/jobs/trust';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

/** Step 2 of claiming a startup: check the code, then link the startup as a verified claim. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'company.manage')) return forbidden();

  const body = await request.json().catch(() => ({}));
  const startupId = String(body.startupId ?? '');
  const workEmail = String(body.workEmail ?? '').trim().toLowerCase();
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (!startupId || !workEmail || code.length !== 6) {
    return NextResponse.json({ error: 'Enter the 6-digit code from the email.' }, { status: 400 });
  }

  const startup = await prisma.startup.findFirst({
    where: { id: startupId, deletedAt: null },
    select: { id: true, name: true, websiteUrl: true },
  });
  const companyDomain = websiteDomain(startup?.websiteUrl);
  if (!startup || !companyDomain || !emailMatchesDomain(workEmail, companyDomain)) {
    return NextResponse.json({ error: 'This claim is no longer valid. Start again.' }, { status: 400 });
  }

  const purpose = `employer_claim:${startup.id}`;
  const rows = await sql`
    SELECT id, attempts, code FROM "EmailOtp"
    WHERE email = ${workEmail} AND purpose = ${purpose} AND verified = false AND "expiresAt" > NOW()
    ORDER BY "createdAt" DESC LIMIT 1
  `;
  const otp = rows[0] as { id: string; attempts: number; code: string } | undefined;
  if (!otp) return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 });
  if (otp.attempts >= 3) {
    await sql`DELETE FROM "EmailOtp" WHERE id = ${otp.id}`;
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }
  await sql`UPDATE "EmailOtp" SET attempts = attempts + 1 WHERE id = ${otp.id}`;

  const hashed = crypto.createHash('sha256').update(code).digest('hex');
  const match = otp.code.length === hashed.length && crypto.timingSafeEqual(Buffer.from(otp.code), Buffer.from(hashed));
  if (!match) {
    const left = 3 - (otp.attempts + 1);
    return NextResponse.json({ error: `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.` }, { status: 400 });
  }

  // Re-check at write time: another employer may have verified a claim meanwhile.
  const claimedBy = await prisma.jobBoardEmployer.findFirst({
    where: { startupId: startup.id, id: { not: session.id }, startupClaimMethod: { in: [...VERIFIED_CLAIM_METHODS] }, passwordHash: { not: '' } },
    select: { id: true },
  });
  if (claimedBy) return NextResponse.json({ error: `${startup.name} has already been claimed.` }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "EmailOtp" SET verified = true WHERE id = ${otp.id}`;
    // Jobs an admin posted for this startup via a placeholder account now belong to the verified owner.
    const placeholders = await tx.jobBoardEmployer.findMany({
      where: { startupId: startup.id, id: { not: session.id }, passwordHash: '' },
      select: { id: true },
    });
    if (placeholders.length > 0) {
      await tx.jobBoardListing.updateMany({
        where: { employerId: { in: placeholders.map((p) => p.id) }, deletedAt: null },
        data: { employerId: session.id },
      });
    }
    // Any other (placeholder or unverified legacy) link is released so the verified owner can take it.
    await tx.jobBoardEmployer.updateMany({
      where: { startupId: startup.id, id: { not: session.id } },
      data: { startupId: null, startupClaimMethod: null, startupClaimVerifiedAt: null },
    });
    await tx.jobBoardListing.updateMany({
      where: { startupId: startup.id, employerId: { not: session.id } },
      data: { startupId: null },
    });
    await tx.jobBoardEmployer.update({
      where: { id: session.id },
      data: {
        startupId: startup.id,
        startupClaimMethod: 'DOMAIN_OTP',
        startupClaimVerifiedAt: new Date(),
        verifiedCompanyDomain: registrableDomain(emailDomain(workEmail)!),
      },
    });
    await tx.jobBoardListing.updateMany({
      where: { employerId: session.id, deletedAt: null },
      data: { startupId: startup.id },
    });
    // Same proof the founder portal uses, so both portals see the startup as verified.
    await markStartupVerified(tx, startup.id, companyDomain);
  });

  return NextResponse.json({ success: true, startup: { id: startup.id, name: startup.name } });
}
