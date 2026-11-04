import { redirect } from 'next/navigation';
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
  const founderSession = await getFounderSession();
  if (!founderSession) {
    // Signed in, but the account can't use the portal right now: say why. Otherwise, sign in.
    const account = await founderFromCookies();
    if (account && (account.status === 'SUSPENDED' || account.deactivatedAt)) redirect('/account/reactivate');
    redirect('/auth/login');
  }
  const [profile] = await sql`SELECT avatar FROM "FounderUser" WHERE id = ${founderSession.userId} LIMIT 1`;
  const session = { ...founderSession, avatar: profile?.avatar ?? null };

  // Query unverified startups owned by the founder
  const unverifiedStartups = await sql`
    SELECT id, name, slug FROM "Startup"
    WHERE "ownerId" = ${session.userId} AND "isVerified" = false AND "deletedAt" IS NULL
  `;

  const shell = await getFounderShell(session.userId, session.name, await workspaceOwnerIds(session)).catch(() => ({
    workspaceName: session.name, logoUrl: null, startupSlug: null, verified: false, listings: [],
  }));

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
            <CompanyEmailBanner userType="founder" />
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
