import { NextRequest, NextResponse } from "next/server";
import { authRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { passwordProblem } from "@/lib/password-rules";
import { setAccountPassword } from '@/lib/auth/set-password';
import { prisma } from "@udyaibase/database";
import { getOrganizerSession, verifyPassword, hashPassword, createOrganizerSession } from "@/lib/organizer-auth";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  // Checks the current password: limit guesses per account, so an open session can't be used to find it.
  const { success: allowed } = await checkRateLimit(authRateLimit, `organizer-change-password:${session.id}`);
  if (!allowed) return NextResponse.json({ success: false, error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  const { currentPassword, newPassword } = await request.json().catch(() => ({}));
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) return NextResponse.json({ success: false, error: "Both fields required" }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ success: false, error: "Min 8 characters" }, { status: 400 });
  const pwProblem = passwordProblem(newPassword, null, 'mixed', null); if (pwProblem) return NextResponse.json({ success: false, error: pwProblem }, { status: 400 });

  const org = await prisma.eventOrganizer.findUnique({ where: { id: session.id }, select: { email: true, passwordHash: true } });
  if (!org?.passwordHash) return NextResponse.json({ success: false, error: "No password set (Google account)" }, { status: 400 });

  const valid = await verifyPassword(currentPassword, org.passwordHash);
  if (!valid) return NextResponse.json({ success: false, error: "Current password is incorrect" }, { status: 401 });

  const hash = await hashPassword(newPassword);
  // Everywhere it's stored, so the old password stops working at every sign-in.
  await setAccountPassword(org.email, hash);
  // That ended every session, this one included: start a fresh one here so only the other devices are signed out.
  await createOrganizerSession(session.id);
  await logOrganizerActivity(session.id, 'password_changed', { actor: organizerActor(session), request });

  return NextResponse.json({ success: true });
}
