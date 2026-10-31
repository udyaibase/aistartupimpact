'use client';

import { useUser } from '@/components/UserProvider';

/**
 * Browser-side "signed in" gates for cached public pages (the server never reads the session there,
 * so pages stay cacheable). These are soft gates: content is in the page, only its display is gated.
 */
export function SignedIn({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { user } = useUser();
  return <>{user ? children : fallback}</>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  return <>{!user && !loading ? children : null}</>;
}
