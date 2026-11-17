import { NextRequest, NextResponse } from "next/server";
import { isTwoFactorOn } from '@/lib/auth/account-two-factor';
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import { createOrganizerSession, verifyPassword, normalizeEmail, findOrganizerByEmail } from "@/lib/organizer-auth";
import { newVerifyToken } from "@/lib/organizer-auth/verify-token";
import { organizerChallengeToken } from "@/lib/organizer-auth/challenge";
import { sendOrganizerVerificationEmail } from "@/lib/organizer-auth/emails";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { authRateLimit, strictRateLimit, loginFailureRateLimit, failuresUsedUp } from "@/lib/rate-limit";
import { accountLockoutHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = "force-dynamic";

// Five wrong passwords from one network pause sign-in for this account from that network only. The account itself
// locks only after many more failures from anywhere, so someone who knows a host's email can't keep them out.
const ACCOUNT_LOCK_AFTER = 20;
const LOCKOUT_MINUTES = 15;

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ success: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { password } = body;
    const email = normalizeEmail(body.email);
    if (!body.turnstileToken) {
      return NextResponse.json({ success: false, error: "CAPTCHA verification required. Please complete the challenge." }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
    }

    if (!email || !password || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 });
    }

    const organizer = await findOrganizerByEmail(email);

    if (!organizer || !organizer.passwordHash) {
      return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
    }

    if (organizer.lockedUntil) {
      if (organizer.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((organizer.lockedUntil.getTime() - Date.now()) / 60000);
        return NextResponse.json({
          success: false,
          error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
        }, { status: 429 });
      }
      await prisma.eventOrganizer.update({
        where: { id: organizer.id },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
    }

    const failureKey = `organizer:${organizer.id}:${identifier}`;
    if (await failuresUsedUp(loginFailureRateLimit, failureKey)) {
      return NextResponse.json({
        success: false,
        error: `Too many wrong passwords. Try again in ${LOCKOUT_MINUTES} minutes, or reset your password.`,
      }, { status: 429 });
    }

    const valid = await verifyPassword(password, organizer.passwordHash);
    if (!valid) {
      await checkRateLimit(loginFailureRateLimit, failureKey);
      await logOrganizerActivity(organizer.id, 'sign_in_failed', { actor: { name: organizer.name, email: organizer.email }, request, metadata: { reason: 'wrong_password' } });
      const newAttempts = (organizer.failedLoginAttempts || 0) + 1;

      if (newAttempts >= ACCOUNT_LOCK_AFTER) {
        const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        await prisma.eventOrganizer.update({
          where: { id: organizer.id },
          data: { failedLoginAttempts: newAttempts, lockedUntil: lockUntil },
        });

        const resetUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com'}/organizer/forgot-password`;
        sendEmailFireAndForget({
          to: organizer.email,
          subject: 'Security Alert — Failed Login Attempts',
          html: accountLockoutHtml({ name: organizer.name || '', reason: 'password', minutes: LOCKOUT_MINUTES, resetUrl }),
          type: 'security_alert',
        });

        return NextResponse.json({
          success: false,
          error: `Account locked for ${LOCKOUT_MINUTES} minutes due to too many failed attempts. A security alert has been sent to your email.`
        }, { status: 429 });
      }

      await prisma.eventOrganizer.update({
        where: { id: organizer.id },
        data: { failedLoginAttempts: newAttempts },
      });

      // Same words as for an unknown email, so the reply doesn't say whether the account exists.
      return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
    }

    // Only after the password was right, so a stranger can't learn the account's state.
    if (organizer.status === "SUSPENDED") {
      return NextResponse.json({ success: false, error: "Your account has been suspended." }, { status: 403 });
    }

    // The email was never confirmed: no session. Send the link again (a few times an hour at most).
    if (!organizer.emailVerified) {
      const { success: maySend } = await checkRateLimit(strictRateLimit, `organizer-verify-resend:${organizer.id}`);
      if (maySend) {
        const { link, stored } = newVerifyToken();
        await prisma.eventOrganizer.update({ where: { id: organizer.id }, data: { verifyToken: stored, failedLoginAttempts: 0, lockedUntil: null } });
        sendOrganizerVerificationEmail(organizer.email, organizer.name, link).catch(() => {});
      }
      return NextResponse.json({
        success: false, code: "EMAIL_NOT_VERIFIED",
        error: "Confirm your email first. We just sent the link again: open it, then sign in.",
      }, { status: 403 });
    }

    await prisma.eventOrganizer.update({
      where: { id: organizer.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (organizer.deactivatedAt) {
      return NextResponse.json({
        deactivated: true,
        deactivatedAt: organizer.deactivatedAt,
        deletionScheduledAt: organizer.deletionScheduledAt,
        message: organizer.deletionScheduledAt
          ? `Your account is set to be deleted on ${organizer.deletionScheduledAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}. Reactivate it to cancel the deletion.`
          : 'Your account has been deactivated. Would you like to reactivate it?',
        reactivateUrl: '/api/organizer/reactivate',
      });
    }

    if (await isTwoFactorOn(organizer.email)) {
      const challengeToken = await organizerChallengeToken(organizer.id);
      return NextResponse.json({ success: false, requires2FA: true, challengeToken });
    }

    await logOrganizerActivity(organizer.id, 'signed_in', { actor: { name: organizer.name, email: organizer.email }, request, metadata: { method: 'password' } });
    await createOrganizerSession(organizer.id);

    return NextResponse.json({
      success: true,
      data: { id: organizer.id, name: organizer.name, email: organizer.email },
    });
  } catch (error: any) {
    console.error("Organizer login error:", error);
    return NextResponse.json({ success: false, error: "Login failed." }, { status: 500 });
  }
}
