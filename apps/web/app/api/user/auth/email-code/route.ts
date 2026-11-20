import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { sql } from '@/lib/db';
import { createOtp, checkEmailCode } from '@/lib/otp';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { secondFactorChallenge } from '@/lib/auth/second-factor';
import { safeReturnPath } from '@/lib/safe-return';
import { authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { sendCandidateCode } from '@/lib/jobs/candidate-emails';
import { appliedEmailFor, claimApplications, isJobSeekerPath } from '@/lib/jobs/candidate-account';
import { startWebUserSession } from '@/lib/auth/web-user-session';
import { CURRENT_TERMS_VERSION } from '@/lib/terms-version';

export const dynamic = 'force-dynamic';

const PURPOSE = 'web_sign_in';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Job seekers sign in (or sign up) with a code sent to their email. Proving the email is the point: the account is
 * marked verified, so applications sent with that email can be linked to it.
 *   { action: 'send', email, captcha | applyToken } → emails a code
 *   { action: 'verify', email, code, returnTo } → signs in (creating the account if new)
 */
export async function POST(req: NextRequest) {
  const { success } = await checkRateLimit(authRateLimit, `web-code:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ error: 'Too many tries. Wait a few minutes and try again.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address.', field: 'email' }, { status: 400 });

  if (body.action === 'send') {
    // Straight after applying, the code goes to the address they applied with without a second "are you human":
    // they passed that check to apply, minutes ago. Any other address, or any other time, still needs it.
    const justApplied = body.applyToken ? (await appliedEmailFor(body.applyToken).catch(() => null)) === email : false;
    if (!justApplied && !(await verifyTurnstileToken(String(body.captcha ?? '')))) return NextResponse.json({ error: 'Complete the security check and try again.' }, { status: 400 });
    const { otp, error } = await createOtp(email, PURPOSE);
    if (!otp) return NextResponse.json({ error: error || 'Couldn’t send a code. Try again shortly.' }, { status: 429 });
    sendCandidateCode({ to: email, code: otp, purpose: 'sign_in' });
    return NextResponse.json({ success: true });
  }

  if (body.action !== 'verify') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const code = String(body.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Enter the 6-digit code.', field: 'code' }, { status: 400 });
  const check = await checkEmailCode(email, PURPOSE, code, { whenSpent: 'delete' });
  if (!check.ok) {
    const msg = check.reason === 'locked' || check.reason === 'none' ? 'That code has expired. Send a new one.' : `That code isn’t right. ${check.left} ${check.left === 1 ? 'try' : 'tries'} left.`;
    return NextResponse.json({ error: msg, field: 'code' }, { status: 400 });
  }

  // Find or create the account; the email is now proven.
  let rows = await sql`SELECT id, email, name, "isActive", "deactivatedAt", "onboardingCompleted" FROM "WebUser" WHERE email = ${email} LIMIT 1`;
  if (!rows.length) {
    const id = randomBytes(16).toString('hex');
    const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80) || 'Job seeker';
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'user'}-${randomBytes(3).toString('hex')}`;
    await sql`INSERT INTO "WebUser" (id, email, name, slug, "isActive", "emailVerifiedAt", "lastLoginAt", "createdAt", "updatedAt")
      VALUES (${id}, ${email}, ${name}, ${slug}, true, NOW(), NOW(), NOW(), NOW())`;
    rows = [{ id, email, name, isActive: true, deactivatedAt: null, onboardingCompleted: false }];
  }
  const user = rows[0] as { id: string; email: string; name: string; isActive: boolean; deactivatedAt: Date | null; onboardingCompleted: boolean };
  if (!user.isActive || user.deactivatedAt) return NextResponse.json({ error: 'This account is deactivated. Contact support to restore it.' }, { status: 403 });
  await sql`UPDATE "WebUser" SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW()) WHERE id = ${user.id}`;
  // The sign-in panel shows the Terms and Privacy notice next to the buttons; continuing records it, as sign-up does.
  if (body.agreeToTerms === true) {
    await sql`UPDATE "WebUser" SET "termsAcceptedAt" = NOW(), "termsVersion" = ${CURRENT_TERMS_VERSION}
      WHERE id = ${user.id} AND ("termsAcceptedAt" IS NULL OR "termsVersion" IS DISTINCT FROM ${CURRENT_TERMS_VERSION})`;
  }

  const back = safeReturnPath(body.returnTo, '/my-applications');
  if (!user.onboardingCompleted && isJobSeekerPath(back)) {
    await sql`UPDATE "WebUser" SET "onboardingCompleted" = true, "primaryIntent" = COALESCE("primaryIntent", 'looking_for_jobs') WHERE id = ${user.id}`;
    user.onboardingCompleted = true;
  }
  // Accounts with two-step verification still enter their second code, as with Google.
  const challenge = await secondFactorChallenge(user.email);
  if (challenge) return NextResponse.json({ success: true, redirect: `/auth/login?returnTo=${encodeURIComponent(back)}#twofa=${challenge.challengeToken}&type=${challenge.userType}` });

  // Applications sent with this address before they had an account are theirs from this moment (the code proved it).
  await claimApplications({ id: user.id, email, name: user.name, emailVerified: true }).catch(() => 0);
  const res = NextResponse.json({ success: true, redirect: back });
  await startWebUserSession(req, res, user);
  return res;
}
