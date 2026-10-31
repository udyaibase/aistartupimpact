import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import { createUnifiedSession, hashPassword, generateToken } from "@/lib/unified-auth";
import { checkRateLimit, getClientIdentifier, authRateLimit } from "@/lib/rate-limit";
import { isDisposableEmail } from "@udyaibase/utils";
import { consumeVerifiedOtp } from "@/lib/otp";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts." }, { status: 429 });

  const body = await request.json();
  const { name, email, password } = body;
  if (!body.turnstileToken) {
    return NextResponse.json({ success: false, error: "CAPTCHA verification required. Please complete the challenge." }, { status: 403 });
  }
  const isHuman = await verifyTurnstileToken(body.turnstileToken);
  if (!isHuman) {
    return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
  }
  if (!name || !email || !password) return NextResponse.json({ success: false, error: "All fields required." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ success: false, error: "Password min 8 characters." }, { status: 400 });
  if (typeof email !== 'string' || email.length > 255 || !email.includes('@') || !email.split('@')[1]?.includes('.')) return NextResponse.json({ success: false, error: "Invalid email." }, { status: 400 });
  if (isDisposableEmail(email)) return NextResponse.json({ success: false, error: "Disposable email addresses are not allowed. Please use a permanent email." }, { status: 400 });

  const existing = await prisma.unifiedUser.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ success: false, error: "Account already exists. Try signing in." }, { status: 409 });

  // Same rule as the live signup: the email must have passed the emailed-code check first.
  if (!(await consumeVerifiedOtp(email, "signup"))) {
    return NextResponse.json({ success: false, error: "Please verify your email with the code we sent first." }, { status: 403 });
  }

  const passwordHash = await hashPassword(password);
  const verifyToken = generateToken();

  const user = await prisma.unifiedUser.create({
    data: { email, name, passwordHash, emailVerified: true, verifyToken },
  });

  await createUnifiedSession(user.id, "direct");

  return NextResponse.json({ success: true, message: "Account created." });
}
