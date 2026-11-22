import { connection } from 'next/server';

/**
 * Account pages (sign in, sign up, password reset, invite) render on their own, never inside the portal's
 * header and sidebar, even when someone is already signed in. Portal pages live in the (portal) group.
 */
export default async function EmployerAuthLayout({ children }: { children: React.ReactNode }) {
  // Per-request rendering: portal pages carry a fresh CSP nonce on every request (lib/csp.ts, middleware.ts).
  await connection();
  return <>{children}</>;
}
