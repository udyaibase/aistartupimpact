import { redirect } from "next/navigation";
import { sql } from '@/lib/db';
import { getOrganizerSession } from "@/lib/organizer-auth";
import OrganizerSidebar from "@/components/organizer/OrganizerSidebar";
import OrganizerHeader from "@/components/organizer/OrganizerHeader";
import OrganizerMobileNav from "@/components/organizer/OrganizerMobileNav";
import GuideHost from "@/components/organizer/guide/GuideHost";
import { SidebarProvider } from "@/components/ui/SidebarContext";
import CompanyEmailBanner from "@/components/CompanyEmailBanner";
import PlanBanner from "@/components/billing/PlanBanner";
import { hostPlanPhase, isPlatformOrganizer } from "@/lib/events/plans";
import { prisma } from "@udyaibase/database";
import WorkspaceSwitcher from "@/components/organizer/WorkspaceSwitcher";
import { activeMembership, OWN_WORKSPACE } from "@/lib/organizer-auth/workspace";
import { getPermissions } from "@/lib/organizer-auth/permissions";
import { accessFor, canOpen } from "@/lib/organizer-auth/nav";

export default async function OrganizerWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The same resolver every organizer API route uses, so a page never shows one account while its buttons act
  // as another (and deactivated or suspended accounts are refused in one place).
  const session = await getOrganizerSession();

  if (!session) redirect("/organizer/login");
  // People who are also on another host's team choose which workspace they are working in.
  const { active, memberships } = await activeMembership(session.id, session.email).catch(() => ({ active: null, memberships: [] }));
  const workspaces = memberships.length
    ? [{ id: OWN_WORKSPACE, name: session.name, role: "OWNER" }, ...memberships.map((m) => ({ id: m.organizerId, name: m.organizerName, role: m.role }))]
    : [];

  // What the menus show: everything in their own workspace, only what their role allows in someone else's.
  const access = accessFor(active ? getPermissions(active.role) : [], !!active);

  // The plan banner and event count describe the workspace being worked in, like every page below.
  const workspaceId = active?.organizerId ?? session.id;
  const hostRow = await prisma.eventOrganizer.findUnique({ where: { id: workspaceId }, select: { plan: true, planExpiresAt: true, email: true } }).catch(() => null);
  const hostPlan = hostRow && !isPlatformOrganizer(hostRow.email) ? hostPlanPhase(hostRow) : null;

  let eventCount = 0;
  try {
    const rows = await sql`SELECT COUNT(*)::int AS c FROM "Event" WHERE "organizerId" = ${workspaceId} AND "deletedAt" IS NULL`;
    eventCount = rows[0]?.c ?? 0;
  } catch {}

  return (
    <SidebarProvider storageKey="organizer-sidebar-collapsed">
      <div className="organizer-portal flex h-[100dvh] bg-page dark:bg-page-dark overflow-hidden">
        <div className="hidden md:block">
          <OrganizerSidebar organizer={session} eventCount={eventCount} access={access} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <OrganizerHeader organizer={session} access={access} />
          <main className="relative flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 lg:px-10 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
            <WorkspaceSwitcher workspaces={workspaces} active={active?.organizerId ?? OWN_WORKSPACE} />
            {/* About the person's own workspace badge: not shown while working in someone else's. */}
            {!active && <CompanyEmailBanner userType="organizer" />}
            {hostPlan && canOpen("/organizer/billing", access) && <PlanBanner phase={hostPlan.phase} planName="Pro" endsAt={hostPlan.endsAt} graceEndsAt={hostPlan.graceEndsAt} billingHref="/organizer/billing" canRenew pausedWhatInGrace="New promo emails are paused." />}
            {children}
          </main>
        </div>
        <OrganizerMobileNav access={access} />
        <GuideHost />
      </div>
    </SidebarProvider>
  );
}
