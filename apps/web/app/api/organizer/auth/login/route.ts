import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import { createOrganizerSession, verifyPassword } from "@/lib/organizer-auth";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { authRateLimit } from "@/lib/rate-limit";
import { SignJWT } from "jose";
import { securityAlertHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";

const CHALLENGE_SECRET = new TextEncoder().encode(process.env.ORGANIZER_JWT_SECRET || process.env.USER_JWT_SECRET!);

export const dynamic = "force-dynamic";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ success: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { email, password } = body;
    if (!body.turnstileToken) {
      return NextResponse.json({ success: false, error: "CAPTCHA verification required. Please complete the challenge." }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
    }

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { email },
      select: {
        id: true, email: true, name: true, passwordHash: true, status: true,
        twoFactorEnabled: true, failedLoginAttempts: true, lockedUntil: true, deactivatedAt: true,
      },
    });

    if (!organizer || !organizer.passwordHash) {
      return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
    }

    if (organizer.status === "SUSPENDED") {
      return NextResponse.json({ success: false, error: "Your account has been suspended." }, { status: 403 });
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

    const valid = await verifyPassword(password, organizer.passwordHash);
    if (!valid) {
      const newAttempts = (organizer.failedLoginAttempts || 0) + 1;

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        await prisma.eventOrganizer.update({
          where: { id: organizer.id },
          data: { failedLoginAttempts: newAttempts, lockedUntil: lockUntil },
        });

        const resetUrl = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com'}/organizer/forgot-password`;
        sendEmailFireAndForget({
          to: organizer.email,
          subject: 'Security Alert — Failed Login Attempts',
          html: securityAlertHtml(organizer.name || 'Organizer', newAttempts, LOCKOUT_MINUTES, resetUrl),
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

      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      return NextResponse.json({
        success: false,
        error: `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before account lockout.`
      }, { status: 401 });
    }

    await prisma.eventOrganizer.update({
      where: { id: organizer.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (organizer.deactivatedAt) {
      return NextResponse.json({
        deactivated: true,
        deactivatedAt: organizer.deactivatedAt,
        message: 'Your account has been deactivated. Would you like to reactivate it?',
        reactivateUrl: '/api/organizer/reactivate',
      });
    }

    if (organizer.twoFactorEnabled) {
      const challengeToken = await new SignJWT({ userId: organizer.id, userType: 'organizer', purpose: '2fa-challenge' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(CHALLENGE_SECRET);
      return NextResponse.json({ success: false, requires2FA: true, challengeToken });
    }

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
