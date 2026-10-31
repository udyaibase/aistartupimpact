import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import { generateToken } from "@/lib/organizer-auth";
import { sendOrganizerPasswordResetEmail } from "@/lib/organizer-auth/emails";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { strictRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/auth/forgot-password
 * Sends a password reset email if the account exists.
 * Always returns success (doesn't reveal if email exists).
 */
export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(strictRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ success: true, message: "If an account exists, a reset link has been sent." });
  }

  try {
    const body = await request.json();
    const { email } = body;
    if (!body.turnstileToken) {
      return NextResponse.json({ success: false, error: "CAPTCHA verification required. Please complete the challenge." }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
    }

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (organizer) {
      const resetToken = `${generateToken()}.${Date.now()}`;

      await prisma.eventOrganizer.update({
        where: { id: organizer.id },
        data: { verifyToken: resetToken },
      });

      // Send reset email
      sendOrganizerPasswordResetEmail(organizer.email, organizer.name, resetToken).catch((err) => {
        console.error("Failed to send reset email:", err);
      });
    }

    // Always return success (don't reveal if account exists)
    return NextResponse.json({
      success: true,
      message: "If an account with this email exists, we've sent a password reset link.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ success: true, message: "If an account exists, a reset link has been sent." });
  }
}
