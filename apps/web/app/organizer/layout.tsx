import { jwtSecret } from '@/lib/jwt-secret';
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { sql } from '@/lib/db';
import { getOrganizerSession } from "@/lib/organizer-auth";
import { getUnifiedSession } from "@/lib/unified-auth";
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

const USER_JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export default async function OrganizerWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: any = null;

  // 1. Try unified session
  const unifiedSession = await getUnifiedSession();
  if (unifiedSession?.organizerId) {
    session = {
      id: unifiedSession.organizerId,
      name: unifiedSession.name,
      email: unifiedSession.email,
      avatar: unifiedSession.avatar || undefined,
    };
  }

  // 2. Fallback: legacy organizer session
  if (!session) {
    session = await getOrganizerSession();
  }

  // 3. Fallback: user-token → find organizer by email
  if (!session) {
    try {
      const cookieStore = await cookies();
      const userToken = cookieStore.get("user-token")?.value;
      if (userToken) {
        const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
        const email = (payload as any).email;
        if (email) {
          const organizers = await sql`
            SELECT id, email, name, avatar FROM "EventOrganizer"
            WHERE email = ${email.toLowerCase()} AND status != 'SUSPENDED'
            LIMIT 1
          `;
          if (organizers.length > 0) {
            session = {
              id: organizers[0].id,
              name: organizers[0].name,
              email: organizers[0].email,
              avatar: organizers[0].avatar || undefined,
            };
          }
        }
      }
    } catch {}
  }

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
            <CompanyEmailBanner userType="organizer" />
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
