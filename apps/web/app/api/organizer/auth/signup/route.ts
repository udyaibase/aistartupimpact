import { NextRequest, NextResponse } from "next/server";
import { passwordProblem } from "@/lib/password-rules";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import { hashPassword, normalizeEmail, findOrganizerByEmail } from "@/lib/organizer-auth";
import { newVerifyToken } from "@/lib/organizer-auth/verify-token";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { sendOrganizerVerificationEmail } from "@/lib/organizer-auth/emails";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { authRateLimit, strictRateLimit } from "@/lib/rate-limit";

const SIGNED_UP_MESSAGE = "Check your email. We sent a link to confirm your address: open it, then sign in.";
import { isDisposableEmail } from "@udyaibase/utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ success: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { name, password, company } = body;
    // One form everywhere (trimmed, lower case), so "Bob@x.com" can never be a second account next to "bob@x.com".
    const email = normalizeEmail(body.email);
    if (!body.turnstileToken) {
      return NextResponse.json({ success: false, error: "CAPTCHA verification required. Please complete the challenge." }, { status: 403 });
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
    }

    if (!name || typeof name !== 'string' || !email || !password || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: "Name, email, and password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const pwProblem = passwordProblem(password, email, 'mixed', name); if (pwProblem) return NextResponse.json({ success: false, error: pwProblem }, { status: 400 });
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain an uppercase letter." }, { status: 400 });
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain a lowercase letter." }, { status: 400 });
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json({ success: false, error: "Password must contain a number." }, { status: 400 });
    }

    if (typeof email !== 'string' || email.length > 255 || !email.includes('@') || !email.split('@')[1]?.includes('.')) {
      return NextResponse.json({ success: false, error: "Invalid email address." }, { status: 400 });
    }

    if (isDisposableEmail(email)) {
      return NextResponse.json({ success: false, error: "Disposable email addresses are not allowed. Please use a permanent email." }, { status: 400 });
    }

    // An account whose email was confirmed is taken. One that never confirmed proves nothing about who owns the
    // address, so a new sign-up replaces it (new password, old sessions ended) and the confirmation goes out again.
    const existing = await findOrganizerByEmail(email);
    // The reply is the same as for a new sign-up, so this form can't be used to learn who has an account. The
    // real owner gets an email pointing them to sign-in and password reset instead (a few times an hour at most).
    if (existing && (existing.emailVerified || existing.googleId)) {
      const { success: maySend } = await checkRateLimit(strictRateLimit, `organizer-signup-exists:${existing.id}`);
      if (maySend) {
        const site = process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";
        sendEmailFireAndForget({
          to: existing.email,
          subject: "You already have an Udyaibase Events account",
          html: `<p>Someone tried to create an Udyaibase Events account with this email address. You already have one.</p><p><a href="${site}/organizer/login">Sign in</a>, or <a href="${site}/organizer/forgot-password">reset your password</a> if you've forgotten it.</p><p>If this wasn't you, you can ignore this email: nothing has changed on your account.</p>`,
          type: "security_alert",
        });
      }
      return NextResponse.json({ success: true, needsVerification: true, message: SIGNED_UP_MESSAGE });
    }

    const passwordHash = await hashPassword(password);
    // The time is part of the token, so the link can expire; only a hash is stored (see ../verify).
    const { link: verifyLink, stored: verifyToken } = newVerifyToken();
    const cleanName = name.trim().slice(0, 100);
    const cleanCompany = typeof company === 'string' && company.trim() ? company.trim().slice(0, 100) : null;

    if (existing) {
      await prisma.$transaction([
        prisma.eventOrganizerSession.deleteMany({ where: { organizerId: existing.id } }),
        prisma.eventOrganizer.update({
          where: { id: existing.id },
          data: { email, name: cleanName, passwordHash, company: cleanCompany, verifyToken, failedLoginAttempts: 0, lockedUntil: null },
        }),
      ]);
    } else {
      await prisma.eventOrganizer.create({
        data: { email, name: cleanName, passwordHash, company: cleanCompany, emailVerified: false, verifyToken, status: "PENDING_VERIFICATION" },
      });
    }

    sendOrganizerVerificationEmail(email, cleanName, verifyLink).catch((err) => {
      console.error("Failed to send verification email:", err);
    });

    // No session yet: the portal opens once the email is confirmed.
    return NextResponse.json({
      success: true,
      needsVerification: true,
      message: SIGNED_UP_MESSAGE,
    });
  } catch (error: any) {
    console.error("Organizer signup error:", error);
    return NextResponse.json({ success: false, error: "Signup failed. Please try again." }, { status: 500 });
  }
}
