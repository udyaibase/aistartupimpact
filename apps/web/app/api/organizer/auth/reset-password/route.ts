import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import { sql } from "@/lib/db";
import { hashPassword, createOrganizerSession } from "@/lib/organizer-auth";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { authRateLimit } from "@/lib/rate-limit";

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
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain an uppercase letter." }, { status: 400 });
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain a lowercase letter." }, { status: 400 });
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain a number." }, { status: 400 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { verifyToken: token },
      select: { id: true, email: true, name: true, verifyToken: true },
    });

    if (!organizer) {
      return NextResponse.json({ success: false, error: "Invalid or expired reset link." }, { status: 400 });
    }

    const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
    const tokenParts = organizer.verifyToken?.split(".");
    const tokenTimestamp = tokenParts ? parseInt(tokenParts[tokenParts.length - 1], 10) : 0;
    if (!tokenTimestamp || Date.now() - tokenTimestamp > RESET_TOKEN_EXPIRY_MS) {
      await prisma.eventOrganizer.update({
        where: { id: organizer.id },
        data: { verifyToken: null },
      });
      return NextResponse.json({ success: false, error: "Reset link has expired. Please request a new one." }, { status: 400 });
    }

    // Update password and clear token
    const passwordHash = await hashPassword(password);
    await prisma.eventOrganizer.update({
      where: { id: organizer.id },
      data: {
        passwordHash,
        verifyToken: null,
        emailVerified: true,
        status: "ACTIVE",
      },
    });

    // Invalidate all existing sessions before creating a new one
    await sql`DELETE FROM "EventOrganizerSession" WHERE "organizerId" = ${organizer.id}`;

    // Auto-login after password reset
    await createOrganizerSession(organizer.id);

    return NextResponse.json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ success: false, error: "Reset failed. Please try again." }, { status: 500 });
  }
}
