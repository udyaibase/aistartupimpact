import { NextRequest, NextResponse } from "next/server";
import { setAccountPassword } from '@/lib/auth/set-password';
import { prisma } from "@udyaibase/database";
import { getOrganizerSession, verifyPassword, hashPassword } from "@/lib/organizer-auth";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ success: false, error: "Both fields required" }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ success: false, error: "Min 8 characters" }, { status: 400 });

  const org = await prisma.eventOrganizer.findUnique({ where: { id: session.id }, select: { email: true, passwordHash: true } });
  if (!org?.passwordHash) return NextResponse.json({ success: false, error: "No password set (Google account)" }, { status: 400 });

  const valid = await verifyPassword(currentPassword, org.passwordHash);
  if (!valid) return NextResponse.json({ success: false, error: "Current password is incorrect" }, { status: 401 });

  const hash = await hashPassword(newPassword);
  // Everywhere it's stored, so the old password stops working at every sign-in.
  await setAccountPassword(org.email, hash);
  await logOrganizerActivity(session.id, 'password_changed', { actor: organizerActor(session), request });

  return NextResponse.json({ success: true });
}
