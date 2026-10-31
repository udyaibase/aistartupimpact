import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { createOtp } from "@/lib/otp";
import { otpEmailHtml } from "@udyaibase/utils";
import { sendEmail } from "@/lib/email/send";
import { checkRateLimit, getClientIdentifier, authRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts." }, { status: 429 });

  const { email } = await request.json();
  if (!email) return NextResponse.json({ success: false, error: "Email required." }, { status: 400 });

  const user = await prisma.unifiedUser.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal if account exists
    return NextResponse.json({ success: true, message: "If account exists, verification email sent." });
  }

  if (user.emailVerified) {
    return NextResponse.json({ success: true, message: "If account exists, verification email sent." });
  }

  // Email a fresh 6-digit code (the same code flow signup uses).
  const { otp } = await createOtp(user.email, "verify");
  if (otp) {
    await sendEmail({ to: user.email.toLowerCase(), subject: `${otp} is your verification code`, html: otpEmailHtml(otp), type: "otp" });
  }
  return NextResponse.json({ success: true, message: "If account exists, verification email sent." });
}
