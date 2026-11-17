import { prisma } from "@udyaibase/database";

/**
 * Permission matrix for organizer team roles.
 *
 * OWNER    = the organizer who created the org (full access, implicit)
 * ADMIN    = full access to all features
 * MANAGER  = events, registrations, promote, analytics — no team/settings/billing
 * STAFF    = view attendees, check-in, view analytics — no create/edit/delete, no attendee export
 * CHECK_IN = only check-in scanner
 */

export type Permission =
  | "events.create"
  | "events.edit"
  | "events.delete"
  | "events.view"
  | "registrations.view"
  | "registrations.manage"
  /** Download the attendee list (names, emails, phones) as a file. */
  | "registrations.export"
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
    "registrations.view", "registrations.manage", "registrations.export",
    "checkin", "analytics.view", "promote",
    "team.view", "team.manage", "settings", "upload", "embed.manage", "embed.view", "billing",
  ],
  ADMIN: [
    "events.create", "events.edit", "events.delete", "events.view",
    "registrations.view", "registrations.manage", "registrations.export",
    "checkin", "analytics.view", "promote",
    "team.view", "team.manage", "settings", "upload", "embed.manage", "embed.view", "billing",
  ],
  MANAGER: [
    "events.create", "events.edit", "events.view",
    "registrations.view", "registrations.manage", "registrations.export",
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

/** Roles a teammate can hold (OWNER is implicit and never assigned). */
export const TEAM_ROLES = ["ADMIN", "MANAGER", "STAFF", "CHECK_IN"] as const;
export type TeamRoleName = (typeof TEAM_ROLES)[number];

export function isTeamRole(role: unknown): role is TeamRoleName {
  return typeof role === "string" && (TEAM_ROLES as readonly string[]).includes(role);
}

/** Roles this person may give a teammate: strictly below their own. */
export function assignableRoles(actorRole: string): TeamRoleName[] {
  return TEAM_ROLES.filter((r) => canAssignRole(actorRole, r));
}

/**
 * Keep only event ids that belong to this workspace (and aren't deleted). `undefined` means "leave as is";
 * a non-array or anything else is rejected by the caller.
 */
export async function ownEventIds(organizerId: string, ids: unknown): Promise<string[] | null> {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string") || ids.length > 500) return null;
  if (ids.length === 0) return [];
  const rows = await prisma.event.findMany({
    where: { organizerId, deletedAt: null, id: { in: Array.from(new Set(ids as string[])) } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

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
  // Their own workspace (null), or the team they chose to work in.
  const { activeMembership } = await import("./workspace");
  const { active } = await activeMembership(sessionOrganizerId, sessionEmail);
  if (!active) return null;

  return {
    organizerId: active.organizerId,
    role: active.role as TeamContext["role"],
    teamMemberId: active.teamMemberId,
    assignedEventIds: active.assignedEventIds, // undefined = all events
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
