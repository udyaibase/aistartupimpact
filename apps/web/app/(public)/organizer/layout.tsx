import { connection } from 'next/server';

/**
 * Organizer account pages (sign in, sign up, password reset, account transfer) sit under /organizer, so they get the
 * portal's strict CSP with a per-request nonce (lib/csp.ts, middleware.ts). A pre-built static page can't carry that
 * nonce and its scripts would be blocked, so these render per request too.
 */
export default async function OrganizerAccountPagesLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return <>{children}</>;
}
