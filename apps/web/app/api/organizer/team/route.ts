import { NextRequest, NextResponse } from "next/server";
import { hostPlanStatus } from "@/lib/events/billing";
import { HOST_PLANS } from "@/lib/events/plans";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { canAssignRole } from "@/lib/organizer-auth/permissions";
import { teamInviteHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * GET /api/organizer/team — List team members
 */
export async function GET() {
  const result = await requirePermission("team.view");
  if (result instanceof NextResponse) return result;
  const session = result;

  const members = await prisma.eventTeamMember.findMany({
    where: { organizerId: session.organizerId },
    orderBy: { createdAt: "desc" },
    include: { assignments: { include: { event: { select: { id: true, title: true } } } } },
  });

  return NextResponse.json({ success: true, members });
}

/**
 * POST /api/organizer/team — Invite new team member
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("team.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { email, role, eventIds } = await request.json();

  if (!email) return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });

  const assignedRole = role || "STAFF";
  if (!canAssignRole(session.role, assignedRole)) {
    return NextResponse.json({ success: false, error: "Cannot assign a role equal to or higher than your own" }, { status: 403 });
  }

  // Check duplicate
  const existing = await prisma.eventTeamMember.findUnique({
    where: { organizerId_email: { organizerId: session.organizerId, email } },
  });
  if (existing && existing.status === "ACTIVE") {
    return NextResponse.json({ success: false, error: "Already an active team member" }, { status: 409 });
  }

  // Plan seat limit (re-inviting a pending or removed person doesn't add a seat if they're already counted).
  const status = await hostPlanStatus(session.organizerId);
  if (status && status.team >= status.plan.teamMembers && !(existing && existing.status === "PENDING")) {
    return NextResponse.json({ success: false, code: "plan_limit", error: `The ${status.plan.name} plan includes ${status.plan.teamMembers} teammates. Remove one or upgrade to Pro for up to ${HOST_PLANS.PRO.teamMembers}.` }, { status: 403 });
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

  // Create or reactivate
  let member;
  if (existing) {
    member = await prisma.eventTeamMember.update({
      where: { id: existing.id },
      data: { role: role || "STAFF", status: "PENDING", inviteToken, expiresAt, acceptedAt: null, passwordHash: null },
    });
  } else {
    member = await prisma.eventTeamMember.create({
      data: { organizerId: session.organizerId, email, role: role || "STAFF", inviteToken, expiresAt },
    });
  }

  // Assign events
  if (eventIds && eventIds.length > 0) {
    await prisma.eventTeamAssignment.deleteMany({ where: { teamMemberId: member.id } });
    await prisma.eventTeamAssignment.createMany({
      data: eventIds.map((eventId: string) => ({ teamMemberId: member.id, eventId })),
    });
  }

  // Send invite email
  const acceptUrl = `${SITE_URL}/team/accept?token=${inviteToken}`;
  sendEmailFireAndForget({
    to: email,
    from: `Udyaibase Events <${FROM_EMAIL}>`,
    subject: "You're invited to manage events — Udyaibase",
    html: teamInviteHtml(session.name, role || "STAFF", acceptUrl),
    type: "team_invite",
  });

  return NextResponse.json({ success: true, member });
}
