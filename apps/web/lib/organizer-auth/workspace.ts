import { cookies } from "next/headers";
import { prisma } from "@udyaibase/database";

/**
 * Which host workspace a signed-in person is working in.
 *
 * Everyone has their own workspace and may also be a teammate in others. The choice is explicit: the
 * `organizer_workspace` cookie holds "own" or the id of a host whose team they are on, and the membership is
 * re-checked on every request (so a removed teammate loses access at once). Before this, being on anyone's team
 * silently replaced a person's own workspace, and with two teams it was undefined which one they got.
 *
 * With no choice made yet: a person whose own workspace has events stays in it; a person who only ever joined as
 * a teammate (empty workspace of their own) lands in the team they joined most recently.
 */

export const WORKSPACE_COOKIE = "organizer_workspace";
export const OWN_WORKSPACE = "own";

export interface TeamMembership {
  organizerId: string;
  organizerName: string;
  role: string;
  teamMemberId: string;
  /** Undefined = every event. */
  assignedEventIds?: string[];
}

/** Active team memberships on other hosts' workspaces, newest first. */
export async function teamMemberships(ownOrganizerId: string, email: string): Promise<TeamMembership[]> {
  if (!email) return [];
  const rows = await prisma.eventTeamMember.findMany({
    where: { email: { equals: email.trim(), mode: "insensitive" }, status: "ACTIVE", organizerId: { not: ownOrganizerId } },
    orderBy: [{ acceptedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, organizerId: true, role: true,
      assignments: { select: { eventId: true } },
      organizer: { select: { name: true, company: true, status: true, deactivatedAt: true } },
    },
  });
  return rows
    .filter((m) => m.organizer.status !== "SUSPENDED" && !m.organizer.deactivatedAt)
    .map((m) => ({
      organizerId: m.organizerId,
      organizerName: m.organizer.company || m.organizer.name,
      role: m.role,
      teamMemberId: m.id,
      assignedEventIds: m.assignments.length > 0 ? m.assignments.map((a) => a.eventId) : undefined,
    }));
}

/** Pure choice between the person's own workspace (null) and one of their memberships. */
export function chooseWorkspace(memberships: TeamMembership[], chosen: string | undefined, ownHasEvents: boolean): TeamMembership | null {
  if (memberships.length === 0 || chosen === OWN_WORKSPACE) return null;
  const picked = chosen ? memberships.find((m) => m.organizerId === chosen) : undefined;
  if (picked) return picked;
  return ownHasEvents ? null : memberships[0];
}

/** The membership the person is working under right now, or null when they are in their own workspace. */
export async function activeMembership(ownOrganizerId: string, email: string): Promise<{ active: TeamMembership | null; memberships: TeamMembership[] }> {
  const memberships = await teamMemberships(ownOrganizerId, email);
  if (memberships.length === 0) return { active: null, memberships };
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  // Only needed when no valid choice has been made.
  const needsDefault = chosen !== OWN_WORKSPACE && !memberships.some((m) => m.organizerId === chosen);
  const ownHasEvents = needsDefault
    ? (await prisma.event.count({ where: { organizerId: ownOrganizerId, deletedAt: null }, take: 1 })) > 0
    : false;
  return { active: chooseWorkspace(memberships, chosen, ownHasEvents), memberships };
}
