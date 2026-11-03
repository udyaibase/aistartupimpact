import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminSidebar } from './components/Sidebar';
import { AdminHeader } from './components/Header';
import { SidebarProvider } from './components/Sidebar';
import { redirect } from 'next/navigation';
import { twoFactorBlock } from '@/lib/api-auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  // Second line of defence behind middleware: no dashboard page renders for a session that owes a 2FA step.
  const block = twoFactorBlock(session);
  if (block) redirect(block.status === 401 ? '/verify-2fa' : '/setup-2fa');

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
        <AdminSidebar session={session} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AdminHeader />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50 dark:bg-gray-950">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
