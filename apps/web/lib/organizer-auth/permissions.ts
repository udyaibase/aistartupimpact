import { prisma } from "@udyaibase/database";

/**
 * Permission matrix for organizer team roles.
 *
 * OWNER    = the organizer who created the org (full access, implicit)
 * ADMIN    = full access to all features
 * MANAGER  = events, registrations, promote, analytics — no team/settings/billing
 * STAFF    = view attendees, check-in, view analytics — no create/edit/delete
 * CHECK_IN = only check-in scanner
 */

export type Permission =
  | "events.create"
  | "events.edit"
  | "events.delete"
  | "events.view"
  | "registrations.view"
  | "registrations.manage"
  | "checkin"
  | "analytics.view"
  | "promote"
  | "team.view"
  | "team.manage"
  | "settings"
  | "upload"
  | "embed.manage"
  | "embed.view"
  | "billing";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  OWNER: [
    "events.create", "events.edit", "events.delete", "events.view",
    "registrations.view", "registrations.manage",
    "checkin", "analytics.view", "promote",
    "team.view", "team.manage", "settings", "upload", "embed.manage", "embed.view", "billing",
  ],
  ADMIN: [
    "events.create", "events.edit", "events.delete", "events.view",
    "registrations.view", "registrations.manage",
    "checkin", "analytics.view", "promote",
    "team.view", "team.manage", "settings", "upload", "embed.manage", "embed.view", "billing",
  ],
  MANAGER: [
    "events.create", "events.edit", "events.view",
    "registrations.view", "registrations.manage",
    "checkin", "analytics.view", "promote", "upload",
    "team.view", "embed.manage", "embed.view",
  ],
  STAFF: [
    "events.view",
    "registrations.view",
    "checkin", "analytics.view", "embed.view",
  ],
  CHECK_IN: [
    "checkin",
    "events.view",
  ],
};

const ROLE_RANK: Record<string, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  STAFF: 40,
  CHECK_IN: 20,
};

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function getPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function getRoleRank(role: string): number {
  return ROLE_RANK[role] ?? 0;
}

export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (targetRole === "OWNER") return false;
  return getRoleRank(actorRole) > getRoleRank(targetRole);
}

export function canManageMember(actorRole: string, targetRole: string): boolean {
  return getRoleRank(actorRole) > getRoleRank(targetRole);
}

export interface TeamContext {
  organizerId: string;
  role: string;
  teamMemberId?: string;
  assignedEventIds?: string[];
}

/**
 * Resolve a team member's context from a logged-in organizer session.
 * Returns null if the user is the owner (no team restriction applies).
 * Returns TeamContext if the user is a team member with role-based access.
 */
export async function getTeamContext(sessionOrganizerId: string, sessionEmail: string): Promise<TeamContext | null> {
  // Check if this person is a team member on someone else's org
  const teamMember = await prisma.eventTeamMember.findFirst({
    where: {
      email: sessionEmail,
      status: "ACTIVE",
      organizer: { id: { not: sessionOrganizerId } },
    },
    include: {
      assignments: { select: { eventId: true } },
    },
  });

  if (!teamMember) return null;

  return {
    organizerId: teamMember.organizerId,
    role: teamMember.role,
    teamMemberId: teamMember.id,
    assignedEventIds: teamMember.assignments.length > 0
      ? teamMember.assignments.map(a => a.eventId)
      : undefined, // undefined = all events
  };
}

/**
 * Check if a team member has access to a specific event.
 * Returns true if they have no event restrictions (assigned to all) or the event is in their list.
 */
export function hasEventAccess(ctx: TeamContext, eventId: string): boolean {
  if (!ctx.assignedEventIds) return true; // all events
  return ctx.assignedEventIds.includes(eventId);
}
