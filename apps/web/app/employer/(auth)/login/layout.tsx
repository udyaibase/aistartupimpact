import { redirect } from 'next/navigation';
import { getEmployerSession } from '@/lib/employer-auth';

/** Already signed in: go to the portal instead of showing this page. */
export default async function EmployerLoginLayout({ children }: { children: React.ReactNode }) {
  if (await getEmployerSession()) redirect('/employer');
  return <>{children}</>;
}
