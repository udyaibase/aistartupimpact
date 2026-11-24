import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { safeReturnPath } from '@/lib/safe-return';
import { getFounderSession } from '@/lib/founder-auth';
import { founderFromCookies } from '@/lib/founder/account';
import { workspaceOwnerIds } from '@/lib/founder/access';
import FounderHeader from '@/components/founder/FounderHeader';
import FounderMobileNav from '@/components/founder/FounderMobileNav';
import { getFounderShell } from '@/lib/founder/portal';
import FounderSidebar from '@/components/founder/FounderSidebar';
import { SidebarProvider } from '@/components/ui/SidebarContext';
import { sql } from '@/lib/db';
import DNSVerificationModal from '@/components/founder/DNSVerificationModal';
import CompanyEmailBanner from '@/components/CompanyEmailBanner';

export default async function FounderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Per-request rendering: the portal's CSP carries a fresh nonce on every page (lib/csp.ts, middleware.ts).
  await connection();
  const founderSession = await getFounderSession();
  if (!founderSession) {
    // Signed in, but the account can't use the portal right now: say why. Otherwise, sign in.
    const account = await founderFromCookies();
    if (account && (account.status === 'SUSPENDED' || account.deactivatedAt)) redirect('/account/reactivate');
    // Signed in to Udyaibase but no founder workspace yet (e.g. just signed up from "Submit your startup"):
    // create it and continue, instead of a sign-in page they've already passed.
    const store = await cookies();
    if (!account && (store.has('unified_session') || store.has('user-token'))) {
      const wanted = safeReturnPath((await headers()).get('x-portal-path'), '/founder/dashboard');
      redirect(`/account/workspace-setup?workspace=founder&returnTo=${encodeURIComponent(wanted)}`);
    }
    redirect('/auth/login');
  }
  // Until the profile exists every portal page leads back to onboarding (middleware), so show it on its own,
  // without the sidebar, header and reminders it can't use yet.
  if (founderSession.onboardingCompleted === false) return <>{children}</>;
  // One round trip's worth of waiting instead of three in a row.
  const [profileRows, unverifiedStartups, shell] = await Promise.all([
    sql`SELECT avatar FROM "FounderUser" WHERE id = ${founderSession.userId} LIMIT 1`,
    // Unverified startups owned by the founder, for the verification reminder.
    sql`
      SELECT id, name, slug FROM "Startup"
      WHERE "ownerId" = ${founderSession.userId} AND "isVerified" = false AND "deletedAt" IS NULL
    `,
    workspaceOwnerIds(founderSession)
      .then((ownerIds) => getFounderShell(founderSession.userId, founderSession.name, ownerIds))
      .catch(() => ({ workspaceName: founderSession.name, logoUrl: null, startupSlug: null, verified: false, listings: [] })),
  ]);
  const session = { ...founderSession, avatar: profileRows[0]?.avatar ?? null };

  return (
    <SidebarProvider storageKey="founder-sidebar-collapsed">
      <div className="founder-portal flex h-[100dvh] bg-page dark:bg-page-dark overflow-hidden">
        {/* Sidebar */}
        <div className="hidden md:block">
          <FounderSidebar shell={shell} />
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <FounderHeader session={session} shell={shell} />
          <main className="relative flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 lg:px-10 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
            <CompanyEmailBanner userType="founder" alreadyVerified={shell.verified} />
            {children}
          </main>
        </div>
        <FounderMobileNav shell={shell} />

        {/* DNS Verification Reminder Modal */}
        <DNSVerificationModal unverifiedStartups={unverifiedStartups as any[]} />
      </div>
    </SidebarProvider>
  );
}
