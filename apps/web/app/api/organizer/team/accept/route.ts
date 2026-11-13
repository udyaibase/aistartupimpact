import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";
import { logOrganizerActivity } from '@/lib/workspace-activity';
import { maskEmail } from '@/lib/mask';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "Password required" }, { status: 400 });
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ success: false, error: "Password must be 8–128 characters" }, { status: 400 });
    }

    const member = await prisma.eventTeamMember.findUnique({
      where: { inviteToken: token },
      include: { organizer: { select: { id: true, name: true, company: true } } },
    });

    if (!member) {
      return NextResponse.json({ success: false, error: "Invalid or expired invite" }, { status: 400 });
    }
    if (member.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "Invite expired. Ask organizer to resend." }, { status: 400 });
    }
    if (member.status === "ACTIVE") {
      return NextResponse.json({ success: false, error: "Already accepted" }, { status: 400 });
    }

    const { hash } = await import("bcryptjs");
    const passwordHash = await hash(password, 12);

    await prisma.eventTeamMember.update({
      where: { id: member.id },
      data: { status: "ACTIVE", passwordHash, acceptedAt: new Date() },
    });

    const existingOrganizer = await prisma.eventOrganizer.findUnique({
      where: { email: member.email },
    });

    if (!existingOrganizer) {
      await prisma.eventOrganizer.create({
        data: {
          email: member.email,
          name: member.email.split("@")[0],
          passwordHash,
          emailVerified: true,
          status: "ACTIVE",
          company: member.organizer?.company || undefined,
        },
      });
    } else if (!existingOrganizer.passwordHash) {
      await prisma.eventOrganizer.update({
        where: { id: existingOrganizer.id },
        data: { passwordHash },
      });
    }

    await logOrganizerActivity(member.organizerId, 'team_invite_accepted', { actor: { email: member.email }, request, metadata: { member: maskEmail(member.email) } });
    return NextResponse.json({ success: true, message: "Welcome! You can now log in." });
  } catch (err) {
    console.error("[organizer/team/accept]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
