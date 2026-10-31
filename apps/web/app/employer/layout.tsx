import { getEmployerSession } from '@/lib/employer-auth';
import { getEmployerShell } from '@/lib/employer/portal';
import EmployerSidebar from '@/components/employer/EmployerSidebar';
import EmployerHeader from '@/components/employer/EmployerHeader';
import EmployerMobileNav from '@/components/employer/EmployerMobileNav';
import { SidebarProvider } from '@/components/ui/SidebarContext';
import VerifyEmailBanner from '@/components/employer/VerifyEmailBanner';
import { founderAccountForHiringSession } from '@/lib/people/access';
import PlanBanner from '@/components/billing/PlanBanner';
import { PLANS, planPhase, type PlanKey } from '@/lib/employer/plans';
import { can } from '@/lib/employer/roles';
import { prisma } from '@udyaibase/database';

export default async function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getEmployerSession();

  // If no session, render children without dashboard wrapper
  // (login/signup pages handle their own UI)
  if (!session) {
    return <>{children}</>;
  }

  const base = await getEmployerShell(session.id, session.jobIds?.join(',') ?? '').catch(() => null) ?? {
    companyName: session.companyName,
    logoUrl: null,
    startupName: null,
    startupProfilePath: null,
    claimVerified: false,
    claimLegacy: false,
    emailVerified: true,
    newCandidates: 0,
  };
  const founderPortal = !!(await founderAccountForHiringSession(session).catch(() => null));
  const planRow = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { plan: true, planExpiresAt: true, planIsTrial: true } }).catch(() => null);
  const plan = planRow ? planPhase(planRow) : null;
  const shell = { ...base, role: session.role, jobScoped: !!session.jobIds, founderPortal, viewerName: session.memberName, viewerEmail: session.email };

  return (
    <SidebarProvider storageKey="employer-sidebar-collapsed">
      <div className="employer-portal flex h-[100dvh] bg-page dark:bg-page-dark overflow-hidden">
        <div className="hidden md:block">
          <EmployerSidebar shell={shell} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <EmployerHeader employer={session} shell={shell} />
          <main className="relative flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 lg:px-10 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
            {!shell.emailVerified && <VerifyEmailBanner email={session.email} />}
            {plan && planRow && (
              <PlanBanner phase={plan.phase} planName={PLANS[(planRow.plan in PLANS ? planRow.plan : 'FREE') as PlanKey].name} endsAt={plan.endsAt} graceEndsAt={plan.graceEndsAt}
                billingHref="/employer/billing" canRenew={can(session.role, 'account.manage')} pausedWhatInGrace="New AI reviews are paused; past reviews stay visible." />
            )}
            {children}
          </main>
        </div>
        <EmployerMobileNav shell={shell} />
      </div>
    </SidebarProvider>
  );
}
