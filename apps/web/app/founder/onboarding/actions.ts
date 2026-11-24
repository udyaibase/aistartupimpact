'use server';

import { requireFounderAuth, setFounderSession } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { revalidatePath } from 'next/cache';

export async function completeOnboardingAction(data: {
  name: string;
  company: string;
  previousCompany?: string;
  role: string;
  phone?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  bio?: string;
  avatar?: string;
}) {
  try {
    const session = await requireFounderAuth();

    const name = (data.name ?? '').trim();
    const company = (data.company ?? '').trim();
    const role = (data.role ?? '').trim();
    if (name.length < 2) return { success: false, error: 'Enter your full name.' };
    if (!role) return { success: false, error: 'Choose your role.' };
    if (company.length < 2) return { success: false, error: 'Enter your startup’s name.' };
    if (name.length > 100) return { success: false, error: 'Name must be 100 characters or less.' };
    if (data.bio && data.bio.length > 1000) return { success: false, error: 'Bio must be 1000 characters or less.' };

    // Links: add https:// when missing; anything that still isn't a web address is dropped.
    const link = (v: string | undefined) => {
      const t = (v ?? '').trim();
      if (!t) return null;
      try {
        const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 500) : null;
      } catch { return null; }
    };
    const text = (v: string | undefined, max: number) => (v ?? '').trim().slice(0, max) || null;
    // Optional fields left out (e.g. "Skip for now") keep what's already saved.
    const opt = <T,>(key: keyof typeof data, value: () => T) => (data[key] === undefined ? {} : { [key]: value() });

    await prisma.founderUser.update({
      where: { id: session.userId },
      data: {
        name,
        company: company.slice(0, 100),
        role: role.slice(0, 100),
        ...opt('previousCompany', () => text(data.previousCompany, 200)),
        ...opt('phone', () => text(data.phone, 20)),
        ...opt('linkedin', () => link(data.linkedin)),
        ...opt('twitter', () => link(data.twitter)),
        ...opt('website', () => link(data.website)),
        ...opt('bio', () => text(data.bio, 1000)),
        avatar: data.avatar && /^https:\/\//.test(data.avatar) ? data.avatar.slice(0, 500) : null,
        onboardingCompleted: true,
        onboardingStep: 2,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

    // Refresh the session cookie with onboardingCompleted: true
    await setFounderSession(session.userId, session.email, name, true);

    revalidatePath('/founder/dashboard');
    revalidatePath('/founder/onboarding');

    return { success: true };
  } catch (error: any) {
    console.error('Onboarding completion error:', error);
    return { success: false, error: 'Couldn’t save your profile. Try again.' };
  }
}
