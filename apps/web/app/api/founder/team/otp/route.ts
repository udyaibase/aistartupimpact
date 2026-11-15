import { NextRequest, NextResponse } from "next/server";
import { getFounderSession } from "@/lib/founder-auth";
import { generateOTP } from "@/lib/action-otp";
import { founderTeamOtpHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";

const ACTION_LABELS: Record<string, string> = {
  role_change: "change a team member's role",
  revoke: "revoke a team member's access",
};

export async function POST(request: NextRequest) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

    const { action } = await request.json();
    if (!action || !ACTION_LABELS[action]) {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const { code, token } = generateOTP(session.userId, action);

    sendEmailFireAndForget({
      to: session.email,
      from: `Udyaibase <${FROM_EMAIL}>`,
      subject: `Security Code: ${code} — Team Action Verification`,
      html: founderTeamOtpHtml(ACTION_LABELS[action], code),
      type: "founder_team_otp",
    });

    return NextResponse.json({ success: true, otpToken: token });
  } catch (err) {
    console.error("[founder/team/otp POST]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
