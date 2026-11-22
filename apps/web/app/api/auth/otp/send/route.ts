import { NextRequest, NextResponse } from "next/server";
import { humanCheckFailed } from '@/lib/turnstile';
import { createOtp } from "@/lib/otp";
import { checkRateLimit, getClientIdentifier, authRateLimit } from "@/lib/rate-limit";
import { otpEmailHtml } from "@udyaibase/utils";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(authRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ success: false, error: "Too many requests. Please wait." }, { status: 429 });
  }

  const { email, purpose, turnstileToken } = await request.json();
  // Each request emails a code to the address given: bots must not be able to use it to flood an inbox.
  const notHuman = await humanCheckFailed(turnstileToken);
  if (notHuman) return notHuman;
  if (!email || typeof email !== 'string' || email.length > 255 || !email.includes('@') || !email.split('@')[1]?.includes('.')) {
    return NextResponse.json({ success: false, error: "Valid email required." }, { status: 400 });
  }

  const validPurposes = ["signup", "login", "verify", "workspace_link"];
  const otpPurpose = validPurposes.includes(purpose) ? purpose : "signup";

  const { otp, error } = await createOtp(email, otpPurpose);
  if (!otp) {
    return NextResponse.json({ success: false, error: error || "Failed to generate code." }, { status: 429 });
  }

  const result = await sendEmail({
    to: email.toLowerCase(),
    subject: `${otp} is your verification code`,
    html: otpEmailHtml(otp),
    type: "otp",
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: "Failed to send email." }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Code sent." });
}
