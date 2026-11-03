import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@udyaibase/database";
import { verifyTOTPToken, decryptSecret, verifyBackupCode, createTwoFactorProof, TwoFactorConfigError } from "@/lib/two-factor";
import { USER_2FA_SELECT, clearCodeFailures, isLocked, lockedResponse, recordCodeFailure, wrongCodeResponse } from "@/lib/two-factor-guard";

/**
 * Second step of sign-in. A correct code (or unused backup code) returns a signed proof; the page passes it to
 * the session update, and only then does the session count as verified (see jwt callback in lib/auth).
 */
export async function POST(request: NextRequest) {
  try {
    const jwt = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const userId = typeof jwt?.id === "string" ? jwt.id : null;
    const sid = typeof jwt?.sid === "string" ? jwt.sid : null;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!sid) {
      return NextResponse.json({ success: false, error: "Your session is out of date. Refresh the page and try again." }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const backupCode = typeof body?.backupCode === "string" ? body.backupCode.trim() : "";

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_2FA_SELECT });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ success: false, error: "2FA not enabled" }, { status: 400 });
    }
    if (isLocked(user)) return lockedResponse(user.lockedUntil);

    if (backupCode) {
      const idx = await verifyBackupCode(backupCode, user.twoFactorBackupCodes);
      if (idx === -1) {
        return wrongCodeResponse("Invalid backup code.", await recordCodeFailure(user.id, user.failedLoginAttempts));
      }
      const remaining = user.twoFactorBackupCodes.filter((_, i) => i !== idx);
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorBackupCodes: remaining, failedLoginAttempts: 0, lockedUntil: null },
      });
      return NextResponse.json({ success: true, proof: createTwoFactorProof(user.id, sid), remainingBackupCodes: remaining.length });
    }

    if (!/^\d{6}$/.test(token)) {
      return NextResponse.json({ success: false, error: "Enter a 6-digit code" }, { status: 400 });
    }
    if (!verifyTOTPToken(token, decryptSecret(user.twoFactorSecret))) {
      return wrongCodeResponse("Invalid verification code.", await recordCodeFailure(user.id, user.failedLoginAttempts));
    }

    await clearCodeFailures(user.id, user.failedLoginAttempts);
    return NextResponse.json({ success: true, proof: createTwoFactorProof(user.id, sid) });
  } catch (error) {
    if (error instanceof TwoFactorConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    console.error("2FA verify error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 500 });
  }
}
