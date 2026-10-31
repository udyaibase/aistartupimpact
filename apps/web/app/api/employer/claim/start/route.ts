import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { sql } from '@/lib/db';
import { getEmployerSession } from '@/lib/employer-auth';
import { sendEmail } from '@/lib/email/send';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { emailDomain, emailMatchesDomain, isFreeMailDomain, websiteDomain, VERIFIED_CLAIM_METHODS } from '@/lib/jobs/trust';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

const COOLDOWN_SECONDS = 60;
const CODE_TTL_MINUTES = 10;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Step 1 of claiming a startup: prove control of the startup's domain with a code sent to a work email on it. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'company.manage')) return forbidden();

  const { success: allowed } = await checkRateLimit(authRateLimit, getClientIdentifier(request));
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const startupId = String(body.startupId ?? '');
  const workEmail = String(body.workEmail ?? '').trim().toLowerCase();

  const startup = await prisma.startup.findFirst({
    where: { id: startupId, deletedAt: null },
    select: { id: true, name: true, websiteUrl: true },
  });
  if (!startup) return NextResponse.json({ error: 'Startup not found.' }, { status: 404 });

  const claimedBy = await prisma.jobBoardEmployer.findFirst({
    // Admin placeholder accounts (no password) don't block: the real owner takes over their jobs.
    where: { startupId: startup.id, id: { not: session.id }, startupClaimMethod: { in: [...VERIFIED_CLAIM_METHODS] }, passwordHash: { not: '' } },
    select: { id: true },
  });
  if (claimedBy) {
    return NextResponse.json(
      { error: `${startup.name} has already been claimed. If you work there, ask your admin to invite you or contact support.`, code: 'already_claimed' },
      { status: 409 },
    );
  }

  const companyDomain = websiteDomain(startup.websiteUrl);
  if (!companyDomain) {
    return NextResponse.json(
      { error: `${startup.name} has no website on file, so we can't verify by email. Contact support and we'll verify you manually.`, code: 'no_domain' },
      { status: 422 },
    );
  }

  const domain = emailDomain(workEmail);
  if (!domain) return NextResponse.json({ error: 'Enter a valid work email.', field: 'workEmail' }, { status: 400 });
  if (isFreeMailDomain(domain)) {
    return NextResponse.json({ error: `Use your work email at ${companyDomain}, not a personal address.`, field: 'workEmail' }, { status: 400 });
  }
  if (!emailMatchesDomain(workEmail, companyDomain)) {
    return NextResponse.json({ error: `The email must be on ${companyDomain}, the domain of ${startup.name}'s website.`, field: 'workEmail' }, { status: 400 });
  }

  const purpose = `employer_claim:${startup.id}`;
  const recent = await sql`
    SELECT EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int AS age FROM "EmailOtp"
    WHERE email = ${workEmail} AND purpose = ${purpose} ORDER BY "createdAt" DESC LIMIT 1
  `;
  const age = (recent[0] as { age: number } | undefined)?.age;
  if (age !== undefined && age < COOLDOWN_SECONDS) {
    const retryAfter = COOLDOWN_SECONDS - age;
    return NextResponse.json({ error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter }, { status: 429 });
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const hashed = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  await sql`DELETE FROM "EmailOtp" WHERE email = ${workEmail} AND purpose = ${purpose}`;
  await sql`
    INSERT INTO "EmailOtp" (id, email, code, purpose, "expiresAt", "createdAt")
    VALUES (gen_random_uuid()::text, ${workEmail}, ${hashed}, ${purpose}, ${expiresAt.toISOString()}::timestamp, NOW())
  `;

  const sent = await sendEmail({
    to: workEmail,
    subject: `Your code to claim ${startup.name} on Udyaibase`,
    type: 'otp',
    html: `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
<h1 style="font-size:20px;margin:0 0 8px">Claim ${esc(startup.name)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151">${esc(session.companyName)} asked to manage hiring for ${esc(startup.name)} on Udyaibase. Enter this code to confirm you work there:</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
<p style="margin:0;font-size:13px;color:#6b7280">The code expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, ignore this email; nothing changes without the code.</p>
</td></tr></table></td></tr></table></body></html>`,
  });

  if (!sent.success) {
    await sql`DELETE FROM "EmailOtp" WHERE email = ${workEmail} AND purpose = ${purpose}`;
    return NextResponse.json({ error: "We couldn't send the code right now. Please try again in a few minutes." }, { status: 502 });
  }

  return NextResponse.json({ success: true, companyDomain, cooldown: COOLDOWN_SECONDS });
}
