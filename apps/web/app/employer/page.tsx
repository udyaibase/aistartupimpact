import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';

export default async function EmployerRootPage() {
  await connection(); // per-request: the portal CSP nonce (lib/csp.ts)
  const session = await getEmployerSession();

  if (!session) {
    redirect('/employer/login');
  }

  if (!session.onboardingCompleted) {
    redirect('/employer/onboarding');
  }

  redirect('/employer/dashboard');
}
