import { redirect } from 'next/navigation';
import { getFounderSession } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import OnboardingClient from './OnboardingClient';

export const metadata = { title: 'Welcome' };

export default async function OnboardingPage(
  props: {
    searchParams: Promise<{ returnTo?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getFounderSession();

  if (!session) {
    redirect('/auth/login');
  }

  const user = await prisma.founderUser.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      company: true,
      companyDomain: true,
      role: true,
      phone: true,
      linkedin: true,
      twitter: true,
      website: true,
      previousCompany: true,
      bio: true,
      avatar: true,
      onboardingCompleted: true,
      onboardingStep: true,
    },
  });

  if (!user) {
    redirect('/auth/login');
  }

  // If onboarding is complete, redirect to returnTo or dashboard
  if (user.onboardingCompleted) {
    redirect(searchParams.returnTo || '/founder/dashboard');
  }

  return <OnboardingClient user={user} returnTo={searchParams.returnTo} />;
}
