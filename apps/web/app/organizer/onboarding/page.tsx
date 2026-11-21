import { redirect } from 'next/navigation';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { prisma } from '@udyaibase/database';
import OnboardingClient from './OnboardingClient';

export const metadata = { title: 'Set up your workspace' };

export default async function OrganizerOnboardingPage(
  props: {
    searchParams: Promise<{ returnTo?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getOrganizerSession();

  if (!session) {
    redirect('/organizer/login');
  }

  const organizer = await prisma.eventOrganizer.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      name: true,
      company: true,
      phone: true,
      avatar: true,
      bio: true,
      website: true,
      linkedin: true,
      onboardingCompleted: true,
      onboardingStep: true,
    },
  });

  if (!organizer) {
    redirect('/organizer/login');
  }

  if (organizer.onboardingCompleted) {
    redirect(searchParams.returnTo || '/organizer');
  }

  return <OnboardingClient user={organizer} returnTo={searchParams.returnTo} />;
}
