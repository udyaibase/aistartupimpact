import { NextRequest, NextResponse } from "next/server";
import { hostPlanStatus } from "@/lib/events/billing";
import { HOST_PLANS } from "@/lib/events/plans";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { assignableRoles, canAssignRole, canManageMember, isTeamRole, ownEventIds } from "@/lib/organizer-auth/permissions";
import { teamInviteHtml } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "@/lib/email/send";
import crypto from "crypto";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { maskEmail } from '@/lib/mask';

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

  // Tell the page what this person may do, so it only offers controls the API will accept.
  const canManage = session.role === "OWNER" || session.role === "ADMIN";
  return NextResponse.json({
    success: true,
    members: members.map(({ inviteToken: _t, passwordHash: _p, ...m }) => ({
      ...m,
      canEdit: canManage && canManageMember(session.role, m.role) && m.id !== session.teamMemberId,
    })),
    viewer: { role: session.role, canManage, assignableRoles: canManage ? assignableRoles(session.role) : [] },
  });
}

/**
 * POST /api/organizer/team — Invite new team member
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("team.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 });
  }
  if (email === session.email.trim().toLowerCase()) {
    return NextResponse.json({ success: false, error: "You can't invite yourself" }, { status: 400 });
  }

  const assignedRole = body.role ?? "STAFF";
  if (!isTeamRole(assignedRole)) {
    return NextResponse.json({ success: false, error: "Unknown role" }, { status: 400 });
  }
  if (!canAssignRole(session.role, assignedRole)) {
    return NextResponse.json({ success: false, error: "You can only give a role below your own" }, { status: 403 });
  }
  const eventIds = body.eventIds === undefined ? [] : await ownEventIds(session.organizerId, body.eventIds);
  if (eventIds === null) return NextResponse.json({ success: false, error: "Invalid events" }, { status: 400 });

  // Check duplicate (emails used to be saved as typed, so match case-insensitively)
  const existing = await prisma.eventTeamMember.findFirst({
    where: { organizerId: session.organizerId, email: { equals: email, mode: "insensitive" } },
  });
  if (existing && existing.status !== "REVOKED" && !canManageMember(session.role, existing.role)) {
    return NextResponse.json({ success: false, error: "This person already has a role equal to or above yours" }, { status: 403 });
  }
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
      data: { email, role: assignedRole, status: "PENDING", inviteToken, expiresAt, acceptedAt: null, passwordHash: null },
    });
  } else {
    member = await prisma.eventTeamMember.create({
      data: { organizerId: session.organizerId, email, role: assignedRole, inviteToken, expiresAt },
    });
  }

  // Assign events
  // Always reset on (re)invite, so an old invite's event list doesn't carry over.
  await prisma.eventTeamAssignment.deleteMany({ where: { teamMemberId: member.id } });
  if (eventIds.length > 0) {
    await prisma.eventTeamAssignment.createMany({
      data: eventIds.map((eventId) => ({ teamMemberId: member.id, eventId })),
    });
  }

  // Send invite email
  const acceptUrl = `${SITE_URL}/team/accept?token=${inviteToken}`;
  sendEmailFireAndForget({
    to: email,
    from: `Udyaibase Events <${FROM_EMAIL}>`,
    subject: "You're invited to manage events — Udyaibase",
    html: teamInviteHtml(session.name, assignedRole, acceptUrl),
    type: "team_invite",
  });

  await logOrganizerActivity(session.organizerId, 'team_member_invited', { actor: organizerActor(session), request, metadata: { member: maskEmail(String(email)), role: String(assignedRole) } });
  const { inviteToken: _t, passwordHash: _p, ...safe } = member;
  return NextResponse.json({ success: true, member: { ...safe, assignments: eventIds.map((eventId) => ({ eventId })), canEdit: true } });
}
