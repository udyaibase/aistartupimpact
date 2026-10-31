import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@udyaibase/database";
import { createUnifiedSession, verifyPassword } from "@/lib/unified-auth";
import { checkRateLimit, getClientIdentifier, authRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts." }, { status: 429 });

  const body = await request.json();
  const { email, password } = body;
  if (!body.turnstileToken) {
    return NextResponse.json({ success: false, error: "CAPTCHA verification required. Please complete the challenge." }, { status: 403 });
  }
  const isHuman = await verifyTurnstileToken(body.turnstileToken);
  if (!isHuman) {
    return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
  }
  if (!email || !password) return NextResponse.json({ success: false, error: "Email and password required." }, { status: 400 });

  const user = await prisma.unifiedUser.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });

  // 2FA check
  if (user.twoFactorEnabled) {
    // Return a partial response indicating 2FA is needed
    return NextResponse.json({ success: false, requires2FA: true, userId: user.id });
  }

  await createUnifiedSession(user.id, "direct");

  return NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email },
  });
}
