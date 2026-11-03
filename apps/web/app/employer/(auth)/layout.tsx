/**
 * Account pages (sign in, sign up, password reset, invite) render on their own, never inside the portal's
 * header and sidebar, even when someone is already signed in. Portal pages live in the (portal) group.
 */
export default function EmployerAuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
