import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@udyaibase/database";
import { logAuditEvent } from "@/lib/audit-log";
import {
  generateTOTPSecret, generateQRCode, totpAuthUrl, verifyTOTPToken,
  encryptSecret, decryptSecret, generateBackupCodes, hashBackupCodes,
  createTwoFactorProof, TwoFactorConfigError,
} from "@/lib/two-factor";
import { USER_2FA_SELECT, clearCodeFailures, currentSignInId, isLocked, lockedResponse, recordCodeFailure, wrongCodeResponse } from "@/lib/two-factor-guard";

const STAFF_ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER", "AD_MANAGER", "CONTRIBUTOR", "EVENT_ORGANIZER"];

/**
 * One pending secret per setup: asking again returns the same one, so the QR code already scanned stays valid after
 * a page refresh, a second tab or a double request (React runs the setup page's request twice in development).
 * Two requests racing for a new secret both end up with whichever was stored first.
 */
async function pendingSecret(user: { id: string; email: string; twoFactorSecret: string | null }): Promise<string> {
  if (user.twoFactorSecret) {
    try {
      return decryptSecret(user.twoFactorSecret);
    } catch (err) {
      if (err instanceof TwoFactorConfigError) throw err;
      // Encrypted with an earlier key: unusable, so start again below.
    }
  }
  await prisma.user.updateMany({
    where: { id: user.id, twoFactorEnabled: false, twoFactorSecret: user.twoFactorSecret },
    data: { twoFactorSecret: encryptSecret(generateTOTPSecret(user.email).secret) },
  });
  const stored = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true } });
  return decryptSecret(stored!.twoFactorSecret!);
}

/**
 * Turning 2FA on: "generate" stores a pending secret and returns its QR code; "verify" checks a code from the app,
 * enables 2FA and returns backup codes. Refused while 2FA is already on — replacing the authenticator would
 * otherwise only need the Google sign-in. To change devices: turn 2FA off (needs a current code), then set up again.
 */
export async function POST(request: NextRequest) {
  try {
    // Allowed before 2FA is set up (that's the point), but never for a session that still owes a 2FA check.
    const { session, error } = await requireApiAuth(STAFF_ROLES, { allowPending2FA: true });
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: USER_2FA_SELECT });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { success: false, error: "Two-factor authentication is already on. Turn it off first to set up a new device." },
        { status: 409 },
      );
    }
    if (isLocked(user)) return lockedResponse(user.lockedUntil);

    if (action === "generate") {
      const secret = await pendingSecret(user);
      const qrCode = await generateQRCode(totpAuthUrl(user.email, secret));
      return NextResponse.json({ success: true, qrCode, secret });
    }

    if (action === "verify") {
      if (!/^\d{6}$/.test(token)) {
        return NextResponse.json({ success: false, error: "Enter a 6-digit code" }, { status: 400 });
      }
      if (!user.twoFactorSecret) {
        return NextResponse.json({ success: false, error: "No 2FA setup in progress" }, { status: 400 });
      }
      if (!verifyTOTPToken(token, decryptSecret(user.twoFactorSecret))) {
        return wrongCodeResponse("Invalid code. Check your authenticator app and try again.", await recordCodeFailure(user.id, user.failedLoginAttempts));
      }

      const backupCodes = generateBackupCodes(10);
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true, twoFactorBackupCodes: await hashBackupCodes(backupCodes) },
      });
      await clearCodeFailures(user.id, user.failedLoginAttempts);
      await logAuditEvent({ action: "CONFIG_CHANGE", resourceType: "USER", resourceId: user.id, resourceName: user.email, after: { twoFactorEnabled: true } });

      // They just proved they hold the authenticator — count this sign-in as verified.
      const sid = await currentSignInId(request);
      return NextResponse.json({ success: true, backupCodes, proof: sid ? createTwoFactorProof(user.id, sid) : null });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof TwoFactorConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    console.error("2FA setup error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to setup 2FA" }, { status: 500 });
  }
}
