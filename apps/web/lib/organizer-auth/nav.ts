/**
 * Which organizer portal pages a person can open in the workspace they're working in. Client-safe (no database),
 * so the sidebar, phone menu and search bar can use it. The pages and APIs check the same permissions on the
 * server; this only keeps people from seeing links they can't use.
 */

export interface NavAccess {
  /** Permissions of the person's role in the active workspace (see permissions.ts). */
  perms: string[];
  /** True when working in someone else's workspace as a teammate. */
  teammate: boolean;
}

type Rule = { prefix: string; exact?: boolean; need: string | "owner" | "anyone" };

// Most specific first.
const RULES: Rule[] = [
  { prefix: "/organizer/events/create", need: "events.create" },
  { prefix: "/organizer/events/import", need: "events.create" },
  { prefix: "/organizer/events", need: "events.view" },
  { prefix: "/organizer/attendees", need: "registrations.view" },
  { prefix: "/organizer/check-in", need: "checkin" },
  { prefix: "/organizer/on-site", need: "registrations.manage" },
  { prefix: "/organizer/analytics", need: "analytics.view" },
  { prefix: "/organizer/promote", need: "promote" },
  { prefix: "/organizer/embed", need: "embed.view" },
  { prefix: "/organizer/team", need: "team.view" },
  { prefix: "/organizer/billing", need: "billing" },
  { prefix: "/organizer/activity", need: "settings" },
  // The public organizer profile belongs to the workspace owner; a teammate would only be editing their own.
  { prefix: "/organizer/organization", need: "owner" },
  // Personal: their own account, password, two-factor login and support tickets.
  { prefix: "/organizer/settings", need: "anyone" },
  { prefix: "/organizer/support", need: "anyone" },
  { prefix: "/organizer/profile", need: "anyone" },
  { prefix: "/organizer", exact: true, need: "events.view" },
];

export function canOpen(href: string, access: NavAccess): boolean {
  if (!access.teammate) return true; // their own workspace
  const path = href.split(/[?#]/)[0];
  const rule = RULES.find((r) => (r.exact ? path === r.prefix : path === r.prefix || path.startsWith(r.prefix + "/")));
  if (!rule || rule.need === "anyone") return true;
  if (rule.need === "owner") return !access.teammate;
  return access.perms.includes(rule.need);
}

/** Owners in their own workspace see everything. */
export const OWNER_ACCESS: NavAccess = { perms: ["*"], teammate: false };

export function accessFor(perms: string[], teammate: boolean): NavAccess {
  return teammate ? { perms, teammate } : OWNER_ACCESS;
}

/** Keep links the person can open; drop section headings left with nothing under them. */
export function filterNav<T extends { href?: string; type?: string }>(items: T[], access: NavAccess): T[] {
  if (!access.teammate) return items;
  const kept = items.filter((i) => i.type === "divider" || !i.href || canOpen(i.href, access));
  return kept.filter((i, idx) => i.type !== "divider" || (kept[idx + 1] && kept[idx + 1].type !== "divider"));
}
