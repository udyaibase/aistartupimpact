import { NextResponse } from "next/server";
import { getOrganizerSession, type OrganizerSession } from "./index";
import { hasPermission, type Permission } from "./permissions";
import { prisma } from "@udyaibase/database";

export interface AuthorizedSession extends OrganizerSession {
  role: string;
  organizerId: string;
  teamMemberId?: string;
  assignedEventIds?: string[];
}

/**
 * Get the organizer session and verify it has the required permission.
 * Owners always have all permissions.
 * Team members are checked against the role permission matrix.
 *
 * Returns the session with role info, or a 401/403 NextResponse.
 */
export async function requirePermission(
  permission: Permission
): Promise<AuthorizedSession | NextResponse> {
  const session = await getOrganizerSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  // Check if this user is a team member on any org (not just their own)
  const teamMember = await prisma.eventTeamMember.findFirst({
    where: {
      email: session.email,
      status: "ACTIVE",
      organizerId: { not: session.id },
    },
    include: {
      assignments: { select: { eventId: true } },
    },
  });

  // If no team member record on another org → they ARE the owner of their own org
  if (!teamMember) {
    return {
      ...session,
      role: "OWNER",
      organizerId: session.id,
    };
  }

  // Check permission for their role
  if (!hasPermission(teamMember.role, permission)) {
    return NextResponse.json(
      { success: false, error: `Insufficient permissions. Required: ${permission}` },
      { status: 403 }
    );
  }

  return {
    ...session,
    role: teamMember.role,
    organizerId: teamMember.organizerId,
    teamMemberId: teamMember.id,
    assignedEventIds: teamMember.assignments.length > 0
      ? teamMember.assignments.map(a => a.eventId)
      : undefined,
  };
}

/**
 * Check if an authorized session has access to a specific event.
 */
export function canAccessEvent(session: AuthorizedSession, eventId: string): boolean {
  if (session.role === "OWNER" || session.role === "ADMIN") return true;
  if (!session.assignedEventIds) return true;
  return session.assignedEventIds.includes(eventId);
}
