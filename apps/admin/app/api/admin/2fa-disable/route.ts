import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@udyaibase/database";
import { logAuditEvent } from "@/lib/audit-log";
import { verifyTOTPToken, decryptSecret, TwoFactorConfigError } from "@/lib/two-factor";
import { USER_2FA_SELECT, isLocked, lockedResponse, recordCodeFailure, wrongCodeResponse } from "@/lib/two-factor-guard";

const STAFF_ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER", "AD_MANAGER", "CONTRIBUTOR", "EVENT_ORGANIZER"];

/** Turns 2FA off. Always needs a current code from the authenticator, and wrong codes count towards the lock. */
export async function POST(request: NextRequest) {
  try {
    const { session, error } = await requireApiAuth(STAFF_ROLES, { allowPending2FA: true });
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!/^\d{6}$/.test(token)) {
      return NextResponse.json({ success: false, error: "Enter your current 6-digit code to disable 2FA" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: USER_2FA_SELECT });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ success: false, error: "2FA is not enabled" }, { status: 400 });
    }
    if (isLocked(user)) return lockedResponse(user.lockedUntil);

    if (!verifyTOTPToken(token, decryptSecret(user.twoFactorSecret))) {
      return wrongCodeResponse("Invalid verification code.", await recordCodeFailure(user.id, user.failedLoginAttempts));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [], failedLoginAttempts: 0, lockedUntil: null },
    });
    await logAuditEvent({ action: "CONFIG_CHANGE", resourceType: "USER", resourceId: user.id, resourceName: user.email, after: { twoFactorEnabled: false } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TwoFactorConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    console.error("2FA disable error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to disable 2FA" }, { status: 500 });
  }
}
