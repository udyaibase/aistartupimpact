import dynamic from 'next/dynamic';
import { AuthContext } from '@/components/AuthContext';
import { AnnouncementBar } from '@/components/ClientOnly';

// Navbar is above-fold — keep SSR. Footer is below-fold — lazy load.
import Navbar from '@/components/layout/Navbar';
const Footer = dynamic(() => import('@/components/layout/Footer'));

// No cookies() or headers() here: reading them would make every public page render on every request
// (no caching). Sign-in state is handled in the browser (UserProvider / Navbar).
export default function PublicLayout(
  {
    children,
  }: {
    children: React.ReactNode;
  }
) {
  return (
    <AuthContext>
      <AnnouncementBar />
      <Navbar />
      <div className="pt-[96px] sm:pt-[103px] min-h-screen flex flex-col">
        <main className="flex-1 pb-16 lg:pb-0 pb-safe">
          {children}
        </main>
      </div>
      <Footer />
    </AuthContext>
  );
}
