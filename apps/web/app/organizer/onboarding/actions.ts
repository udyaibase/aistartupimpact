'use server';

import { getOrganizerSession } from '@/lib/organizer-auth';
import { prisma } from '@udyaibase/database';
import { revalidatePath } from 'next/cache';
import { isOwnMediaUrl } from '@/lib/events/urls';
import { cleanLink } from '@/lib/events/event-input';

export async function completeOrganizerOnboarding(data: {
  name: string;
  company: string;
  avatar?: string;
  /** Step 2 fields: left out by "Skip for now", so anything saved earlier stays. */
  bio?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await getOrganizerSession();
    if (!session) return { success: false, error: 'Your session has expired. Please sign in again.' };

    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const company = typeof data?.company === 'string' ? data.company.trim() : '';
    if (company.length < 2) return { success: false, error: 'Enter the name attendees will see as the host.' };
    if (name.length < 2) return { success: false, error: 'Enter your full name.' };
    if (name.length > 100 || company.length > 100) return { success: false, error: 'Names must be 100 characters or less.' };
    // Logos come from our own upload, never an outside link.
    if (data.avatar && !isOwnMediaUrl(data.avatar)) return { success: false, error: 'Upload the logo here instead of pasting a link.' };

    const details: { bio?: string; phone?: string | null; website?: string | null; linkedin?: string | null } = {};
    if (data.bio !== undefined) {
      if (String(data.bio).length > 1000) return { success: false, error: 'About must be 1000 characters or less.' };
      details.bio = String(data.bio).trim();
    }
    if (data.phone !== undefined) details.phone = String(data.phone).trim().slice(0, 20) || null;
    if (data.website !== undefined) {
      const website = cleanLink(data.website);
      if (website === undefined) return { success: false, error: 'That website doesn’t look like a link. Try something like yourcommunity.org' };
      details.website = website;
    }
    if (data.linkedin !== undefined) {
      const linkedin = cleanLink(data.linkedin);
      if (linkedin === undefined) return { success: false, error: 'That LinkedIn doesn’t look like a link. Try linkedin.com/company/your-page' };
      details.linkedin = linkedin;
    }

    await prisma.eventOrganizer.update({
      where: { id: session.id },
      data: {
        name,
        company,
        avatar: data.avatar || null,
        ...details,
        onboardingCompleted: true,
        onboardingStep: 2,
        updatedAt: new Date(),
      },
    });

    revalidatePath('/organizer');
    revalidatePath('/organizer/onboarding');
    return { success: true };
  } catch (error) {
    console.error('[organizer onboarding]', error instanceof Error ? error.message : error);
    return { success: false, error: 'Couldn’t save your workspace. Try again.' };
  }
}
