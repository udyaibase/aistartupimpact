import { redirect } from 'next/navigation';
import { getEmployerSession } from '@/lib/employer-auth';
import { prisma } from '@udyaibase/database';
import OnboardingClient from './OnboardingClient';

export default async function EmployerOnboardingPage() {
  const session = await getEmployerSession();

  if (!session) {
    redirect('/employer/login');
  }

  const employer = await prisma.jobBoardEmployer.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      companyName: true,
      logoUrl: true,
      description: true,
      industry: true,
      companySize: true,
      location: true,
      country: true,
      linkedinUrl: true,
      twitterUrl: true,
      websiteUrl: true,
      onboardingCompleted: true,
      onboardingStep: true,
    },
  });

  if (!employer) {
    redirect('/employer/login');
  }

  if (employer.onboardingCompleted) {
    redirect('/employer/dashboard');
  }

  return <OnboardingClient employer={employer} />;
}
