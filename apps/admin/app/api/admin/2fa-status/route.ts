import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@udyaibase/database";

export async function GET() {
  const { session, error } = await requireApiAuth(["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER", "AD_MANAGER", "CONTRIBUTOR", "EVENT_ORGANIZER"], { allowPending2FA: true });
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true, twoFactorBackupCodes: true },
  });

  return NextResponse.json({
    success: true,
    enabled: user?.twoFactorEnabled ?? false,
    backupCodesRemaining: user?.twoFactorBackupCodes?.length ?? 0,
  });
}
