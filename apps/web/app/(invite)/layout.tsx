/**
 * Standalone pages reached from an email (team invitations): no site header, footer, tab bar or branding chrome,
 * so the one task on the page has the person's full attention.
 */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] sm:py-12">
        {children}
      </main>
    </div>
  );
}
