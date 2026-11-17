'use server';

import { getOrganizerSession } from '@/lib/organizer-auth';
import { prisma } from '@udyaibase/database';
import { revalidatePath } from 'next/cache';
import { isOwnMediaUrl } from '@/lib/events/urls';
import { cleanLink } from '@/lib/events/event-input';

export async function completeOrganizerOnboarding(data: {
  name: string;
  company: string;
  bio: string;
  avatar: string;
  phone?: string;
  website?: string;
  linkedin?: string;
}) {
  try {
    const session = await getOrganizerSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!data || typeof data.name !== 'string' || !data.name.trim()) {
      return { success: false, error: 'Name is required' };
    }
    // Logos come from our own upload, never an outside link; website and LinkedIn must be real http(s) links.
    if (data.avatar && !isOwnMediaUrl(data.avatar)) {
      return { success: false, error: 'Upload the logo here instead of pasting a link.' };
    }
    const website = cleanLink(data.website);
    const linkedin = cleanLink(data.linkedin);
    if (website === undefined) return { success: false, error: 'Enter your website as a full link, like https://example.com' };
    if (linkedin === undefined) return { success: false, error: 'Enter your LinkedIn as a full link.' };

    if (data.bio && data.bio.length > 1000) {
      return { success: false, error: 'Bio must be 1000 characters or less' };
    }
    if (data.name.length > 100) {
      return { success: false, error: 'Name must be 100 characters or less' };
    }

    await prisma.eventOrganizer.update({
      where: { id: session.id },
      data: {
        name: data.name.slice(0, 100),
        company: String(data.company ?? '').slice(0, 100),
        bio: String(data.bio ?? '').slice(0, 1000),
        avatar: data.avatar || null,
        phone: typeof data.phone === 'string' ? data.phone.slice(0, 20) || null : null,
        website,
        linkedin,
        onboardingCompleted: true,
        onboardingStep: 2,
        updatedAt: new Date(),
      },
    });

    revalidatePath('/organizer');
    revalidatePath('/organizer/onboarding');

    return { success: true };
  } catch (error: any) {
    console.error('[organizer onboarding]', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to complete onboarding' };
  }
}
