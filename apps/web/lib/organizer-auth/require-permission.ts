import { NextResponse } from "next/server";
import { getOrganizerSession, type OrganizerSession } from "./index";
import { hasPermission, type Permission } from "./permissions";
import { activeMembership } from "./workspace";

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

  // Their own workspace, or a team they chose to work in (see ./workspace.ts).
  const { active: teamMember } = await activeMembership(session.id, session.email);

  // Working in their own workspace → they are its owner
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
    teamMemberId: teamMember.teamMemberId,
    assignedEventIds: teamMember.assignedEventIds,
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

/**
 * Prisma filter for the events this session may see: the active workspace's events, narrowed to the assigned ones
 * for teammates limited to specific events. Server pages and API routes use the same filter, so a page never
 * shows one workspace while its buttons act on another.
 */
export function eventScope(session: AuthorizedSession): { organizerId: string; id?: { in: string[] } } {
  const limited = session.role !== "OWNER" && session.role !== "ADMIN" && session.assignedEventIds;
  return limited ? { organizerId: session.organizerId, id: { in: limited } } : { organizerId: session.organizerId };
}
