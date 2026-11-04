import { NextRequest, NextResponse } from "next/server";
import { teamContext } from "@/lib/founder/access";
import { canManageTeam } from "@/lib/founder-team-permissions";
import { logFounderActivity } from '@/lib/founder/activity';
import { maskEmail } from '@/lib/mask';
import { prisma } from "@udyaibase/database";
import { getFounderSession } from "@/lib/founder-auth";
import { founderTeamInviteHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const VALID_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;

export async function GET() {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const team = await teamContext(session);
    const members = await prisma.founderTeamMember.findMany({
      where: { founderId: team.ownerId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, members, role: team.role, canManage: canManageTeam(team.role) });
  } catch (err) {
    console.error("[founder/team GET]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

    const team = await teamContext(session);
    if (!canManageTeam(team.role)) return NextResponse.json({ success: false, error: "Only the owner or an admin can invite people." }, { status: 403 });

    const { email, role, name } = await request.json();

    if (!email || typeof email !== "string") return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail.length > 255 || !cleanEmail.includes('@') || !cleanEmail.split('@')[1]?.includes('.')) return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
    if (cleanEmail === session.email.toLowerCase()) return NextResponse.json({ success: false, error: "You cannot invite yourself" }, { status: 400 });

    const assignRole = VALID_ROLES.includes(role) ? role : "VIEWER";
    // An admin can't create another admin. Only the owner can.
    if (team.role !== "OWNER" && assignRole === "ADMIN") return NextResponse.json({ success: false, error: "Only the owner can invite an admin." }, { status: 403 });

    const existing = await prisma.founderTeamMember.findUnique({
      where: { founderId_email: { founderId: team.ownerId, email: cleanEmail } },
    });
    if (existing && existing.status === "ACTIVE") {
      return NextResponse.json({ success: false, error: "Already an active team member" }, { status: 409 });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    let member;
    if (existing) {
      member = await prisma.founderTeamMember.update({
        where: { id: existing.id },
        data: { role: assignRole, status: "PENDING", inviteToken, expiresAt, acceptedAt: null, passwordHash: null, name: name?.slice(0, 100) || null },
      });
    } else {
      member = await prisma.founderTeamMember.create({
        data: { founderId: team.ownerId, email: cleanEmail, role: assignRole, inviteToken, expiresAt, name: name?.slice(0, 100) || null },
      });
    }

    const acceptUrl = `${SITE_URL}/founder-team/accept?token=${inviteToken}`;
    sendEmailFireAndForget({
      to: cleanEmail,
      from: `Udyaibase <${FROM_EMAIL}>`,
      subject: `You're invited to join ${session.name}'s team — Udyaibase`,
      html: founderTeamInviteHtml(session.name, assignRole, acceptUrl),
      type: "founder_team_invite",
    });

    await logFounderActivity(team.ownerId, 'team_member_invited', { request, metadata: { member: maskEmail(cleanEmail), role: assignRole } });
    return NextResponse.json({ success: true, member });
  } catch (err) {
    console.error("[founder/team POST]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
