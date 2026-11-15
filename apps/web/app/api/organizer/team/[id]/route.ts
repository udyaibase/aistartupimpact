import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { canAssignRole, canManageMember, isTeamRole, ownEventIds } from "@/lib/organizer-auth/permissions";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { maskEmail } from '@/lib/mask';

export const dynamic = "force-dynamic";

/** PUT — Update team member role/assignments */
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const result = await requirePermission("team.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const member = await prisma.eventTeamMember.findFirst({ where: { id: params.id, organizerId: session.organizerId } });
  if (!member) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  if (member.id === session.teamMemberId) {
    return NextResponse.json({ success: false, error: "You can't change your own role" }, { status: 403 });
  }
  if (!canManageMember(session.role, member.role)) {
    return NextResponse.json({ success: false, error: "Cannot modify a member with an equal or higher role" }, { status: 403 });
  }
  if (member.status === "REVOKED") {
    return NextResponse.json({ success: false, error: "This person was removed. Invite them again instead." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const role = body.role;
  if (role !== undefined && !isTeamRole(role)) {
    return NextResponse.json({ success: false, error: "Unknown role" }, { status: 400 });
  }
  if (role && !canAssignRole(session.role, role)) {
    return NextResponse.json({ success: false, error: "You can only give a role below your own" }, { status: 403 });
  }
  const eventIds = body.eventIds === undefined ? undefined : await ownEventIds(session.organizerId, body.eventIds);
  if (eventIds === null) return NextResponse.json({ success: false, error: "Invalid events" }, { status: 400 });

  await prisma.$transaction([
    ...(role ? [prisma.eventTeamMember.update({ where: { id: member.id }, data: { role } })] : []),
    ...(eventIds !== undefined
      ? [
          prisma.eventTeamAssignment.deleteMany({ where: { teamMemberId: member.id } }),
          ...(eventIds.length > 0
            ? [prisma.eventTeamAssignment.createMany({ data: eventIds.map((eid) => ({ teamMemberId: member.id, eventId: eid })) })]
            : []),
        ]
      : []),
  ]);
  if (role && role !== member.role) {
    await logOrganizerActivity(session.organizerId, 'team_role_changed', { actor: organizerActor(session), request, metadata: { member: maskEmail(member.email), from: member.role, role: String(role) } });
  }
  if (eventIds !== undefined) {
    await logOrganizerActivity(session.organizerId, 'team_events_changed', { actor: organizerActor(session), request, metadata: { member: maskEmail(member.email), events: eventIds.length === 0 ? 'all' : `${eventIds.length} event${eventIds.length === 1 ? '' : 's'}` } });
  }

  return NextResponse.json({ success: true });
}

/** DELETE — Revoke team member */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const result = await requirePermission("team.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const member = await prisma.eventTeamMember.findFirst({ where: { id: params.id, organizerId: session.organizerId } });
  if (!member) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  if (member.id === session.teamMemberId) {
    return NextResponse.json({ success: false, error: "You can't remove yourself from the team." }, { status: 403 });
  }
  if (!canManageMember(session.role, member.role)) {
    return NextResponse.json({ success: false, error: "Cannot revoke a member with an equal or higher role" }, { status: 403 });
  }

  await prisma.eventTeamMember.update({ where: { id: params.id }, data: { status: "REVOKED" } });
  await logOrganizerActivity(session.organizerId, 'team_member_removed', { actor: organizerActor(session), request, metadata: { member: maskEmail(member.email) } });
  return NextResponse.json({ success: true });
}
