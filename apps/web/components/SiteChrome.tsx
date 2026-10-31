'use client';

import { usePathname } from 'next/navigation';

/** Site-wide overlays and trackers; omitted on /embed pages, which render inside customers' sites. */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/embed')) return null;
  return <>{children}</>;
}
