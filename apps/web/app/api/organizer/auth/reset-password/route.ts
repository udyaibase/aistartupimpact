import { NextRequest, NextResponse } from "next/server";
import { passwordProblem } from "@/lib/password-rules";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import crypto from "crypto";
import { setAccountPassword } from "@/lib/auth/set-password";
import { isTwoFactorOn } from "@/lib/auth/account-two-factor";
import { hashPassword, createOrganizerSession } from "@/lib/organizer-auth";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { authRateLimit } from "@/lib/rate-limit";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/auth/reset-password
 * Resets the password using the token from the email.
 */
export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ success: false, error: "Too many attempts." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { token, password } = body;
    if (!body.turnstileToken) {
      return NextResponse.json({ success: false, error: "CAPTCHA verification required. Please complete the challenge." }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
    }

    if (!token || !password) {
      return NextResponse.json({ success: false, error: "Token and new password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const pwProblem = passwordProblem(password, null, 'mixed', null); if (pwProblem) return NextResponse.json({ success: false, error: pwProblem }, { status: 400 });
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain an uppercase letter." }, { status: 400 });
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain a lowercase letter." }, { status: 400 });
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain a number." }, { status: 400 });
    }

    if (typeof token !== "string" || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "Invalid or expired reset link." }, { status: 400 });
    }
    // Reset tokens are stored hashed (see ../forgot-password).
    const stored = `reset:${crypto.createHash("sha256").update(token).digest("hex")}`;
    const organizer = await prisma.eventOrganizer.findUnique({
      where: { verifyToken: stored },
      select: { id: true, email: true, name: true, status: true },
    });

    if (!organizer) {
      return NextResponse.json({ success: false, error: "Invalid or expired reset link." }, { status: 400 });
    }

    // The time is part of the token itself; the hash lookup above proves it wasn't altered.
    const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
    const tokenTimestamp = parseInt(token.split(".").pop() || "", 10);
    if (!tokenTimestamp || Date.now() - tokenTimestamp > RESET_TOKEN_EXPIRY_MS) {
      await prisma.eventOrganizer.update({
        where: { id: organizer.id },
        data: { verifyToken: null },
      });
      return NextResponse.json({ success: false, error: "Reset link has expired. Please request a new one." }, { status: 400 });
    }
    if (organizer.status === "SUSPENDED") {
      return NextResponse.json({ success: false, error: "Your account has been suspended." }, { status: 403 });
    }

    const passwordHash = await hashPassword(password);
    // The link was emailed, so the address is confirmed.
    await prisma.eventOrganizer.update({
      where: { id: organizer.id },
      data: { passwordHash, verifyToken: null, emailVerified: true, status: "ACTIVE", failedLoginAttempts: 0, lockedUntil: null },
    });
    // Everywhere this person's password is stored, so the old one stops working at every sign-in; this also ends
    // every session.
    await setAccountPassword(organizer.email, passwordHash);

    await logOrganizerActivity(organizer.id, 'password_reset', { actor: { name: organizer.name, email: organizer.email }, request });

    // With 2FA on, the emailed link alone doesn't start a session: they sign in with the new password and the code.
    if (await isTwoFactorOn(organizer.email)) {
      return NextResponse.json({ success: true, requiresLogin: true, message: "Password reset. Sign in with your new password and your 2FA code." });
    }
    await createOrganizerSession(organizer.id);

    return NextResponse.json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ success: false, error: "Reset failed. Please try again." }, { status: 500 });
  }
}
