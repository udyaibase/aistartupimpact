/**
 * Who may open each admin section. The single list behind three things, so they can't drift apart:
 * - the sidebar (which links a role sees),
 * - the middleware (typing the address of a section you can't see sends you back to the dashboard),
 * - the section's server actions (requireActionAuth(sectionRoles('/billing'))).
 *
 * Keys are the section's address; anything under it is covered ("/tools-dir/new" follows "/tools-dir"), and the
 * longest matching key wins ("/events/review" before "/events"). Addresses not listed are open to every signed-in
 * staff member (the dashboard, 2FA screens, API routes, which run their own checks).
 */
export const SECTION_ROLES: Record<string, readonly string[]> = {
  '/articles': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER', 'CONTRIBUTOR'],
  '/hero-slots': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/media': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER'],
  '/tickers': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/tools-dir': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/tool-reviews': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/startups-dir': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/startup-reviews': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/funding-dir': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/india-ai/stats': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/india-ai/schemes': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/india-ai/policy': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/india-ai/researchers': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/india-ai/tools': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/india-ai/founders': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/events': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'EVENT_ORGANIZER'],
  '/events/review': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/events/subscribers': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/applications': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/jobs-board': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/employers': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/skills': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/billing': ['SUPER_ADMIN'],
  '/monitoring': ['SUPER_ADMIN'],
  '/plans': ['SUPER_ADMIN'],
  '/promotions': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/subscribers': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'],
  '/newsletter-admin': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/newsletter-highlights': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/testimonials': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'],
  '/announcements': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/placements': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'],
  '/sponsors': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'],
  '/advertise': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'],
  '/advertise/payments': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'],
  '/analytics': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'AD_MANAGER'],
  '/tool-analytics': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'AD_MANAGER'],
  '/listing-edits': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/content-review': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/milestones': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/people': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/founders': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/web-users': ['SUPER_ADMIN'],
  '/activity': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/cities': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/users': ['SUPER_ADMIN'],
  '/consent-logs': ['SUPER_ADMIN'],
  '/support': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/reports': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'],
  '/settings': ['SUPER_ADMIN'],
  '/dev-tools': ['SUPER_ADMIN'],
  // Not in the sidebar, reached from inside other sections.
  '/india-ai': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
  '/funding-rounds': ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'],
};

const KEYS = Object.keys(SECTION_ROLES).sort((a, b) => b.length - a.length);

/** The roles allowed in the section this address belongs to, or null when the address isn't restricted. */
export function rolesForPath(pathname: string): readonly string[] | null {
  const key = KEYS.find((k) => pathname === k || pathname.startsWith(`${k}/`));
  return key ? SECTION_ROLES[key] : null;
}

export function canOpen(role: string | null | undefined, pathname: string): boolean {
  const roles = rolesForPath(pathname);
  return !roles || (!!role && roles.includes(role));
}

/** Roles for a section's server actions, e.g. requireActionAuth(sectionRoles('/sponsors')). */
export function sectionRoles(section: keyof typeof SECTION_ROLES | string): string[] {
  const roles = SECTION_ROLES[section];
  if (!roles) throw new Error(`Unknown admin section: ${section}`);
  return [...roles];
}
