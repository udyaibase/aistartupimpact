'use client';

import { usePathname } from 'next/navigation';

/** Renders its children everywhere except under `prefix` (e.g. a "see plans" banner on the plans page itself). */
export default function HideOnPath({ prefix, children }: { prefix: string; children: React.ReactNode }) {
  const path = usePathname();
  return path === prefix || path?.startsWith(`${prefix}/`) ? null : <>{children}</>;
}
