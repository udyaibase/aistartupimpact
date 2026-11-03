'use server';

import { getEmployerSession, setEmployerSession } from '@/lib/employer-auth';
import { prisma } from '@udyaibase/database';
import { revalidatePath } from 'next/cache';

export async function completeEmployerOnboarding(data: {
  logoUrl: string;
  description: string;
  location: string;
  country: string;
  industry?: string;
  companySize?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
}) {
  try {
    const session = await getEmployerSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    if (data.description && data.description.length > 1000) {
      return { success: false, error: 'Description must be 1000 characters or less' };
    }

    const updated = await prisma.jobBoardEmployer.update({
      where: { id: session.id },
      data: {
        logoUrl: data.logoUrl || null,
        description: data.description.slice(0, 1000),
        location: data.location.slice(0, 200),
        country: data.country.slice(0, 100),
        industry: data.industry?.slice(0, 100) || undefined,
        companySize: data.companySize?.slice(0, 50) || undefined,
        linkedinUrl: data.linkedinUrl?.slice(0, 500) || null,
        twitterUrl: data.twitterUrl?.slice(0, 500) || null,
        onboardingCompleted: true,
        onboardingStep: 2,
        updatedAt: new Date(),
      },
      select: { id: true, email: true, companyName: true, slug: true, plan: true, onboardingCompleted: true },
    });

    await setEmployerSession({
      id: updated.id,
      email: updated.email,
      companyName: updated.companyName,
      slug: updated.slug,
      plan: updated.plan,
      onboardingCompleted: true,
    });

    revalidatePath('/employer/dashboard');
    revalidatePath('/employer/onboarding');

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to complete onboarding' };
  }
}
