import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { canAssignRole, canManageMember } from "@/lib/organizer-auth/permissions";

export const dynamic = "force-dynamic";

/** PUT — Update team member role/assignments */
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const result = await requirePermission("team.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  const member = await prisma.eventTeamMember.findFirst({ where: { id: params.id, organizerId: session.organizerId } });
  if (!member) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  if (!canManageMember(session.role, member.role)) {
    return NextResponse.json({ success: false, error: "Cannot modify a member with an equal or higher role" }, { status: 403 });
  }

  const { role, eventIds } = await request.json();

  if (role && !canAssignRole(session.role, role)) {
    return NextResponse.json({ success: false, error: "Cannot assign a role equal to or higher than your own" }, { status: 403 });
  }

  await prisma.eventTeamMember.update({ where: { id: params.id }, data: { role: role || undefined } });

  if (eventIds !== undefined) {
    await prisma.eventTeamAssignment.deleteMany({ where: { teamMemberId: params.id } });
    if (eventIds.length > 0) {
      await prisma.eventTeamAssignment.createMany({ data: eventIds.map((eid: string) => ({ teamMemberId: params.id, eventId: eid })) });
    }
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

  if (!canManageMember(session.role, member.role)) {
    return NextResponse.json({ success: false, error: "Cannot revoke a member with an equal or higher role" }, { status: 403 });
  }

  await prisma.eventTeamMember.update({ where: { id: params.id }, data: { status: "REVOKED" } });
  return NextResponse.json({ success: true });
}
