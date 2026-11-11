import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import FounderForm from '../FounderForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Add Featured Founder | Admin',
};

export default function NewFounderPage() {
  async function createFounder(formData: FormData) {
    'use server';

    await prisma.featuredFounder.create({
      data: {
        id: `founder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: formData.get('name') as string,
        startupName: formData.get('startupName') as string,
        startupSlug: formData.get('startupSlug') as string || null,
        photoUrl: formData.get('photoUrl') as string || null,
        bio: formData.get('bio') as string,
        achievement: formData.get('achievement') as string,
        fundingRaised: formData.get('fundingRaised') as string || null,
        category: formData.get('category') as string,
        linkedinUrl: formData.get('linkedinUrl') as string || null,
        twitterUrl: formData.get('twitterUrl') as string || null,
        storyUrl: formData.get('storyUrl') as string || null,
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/founders');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Add Featured Founder
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Add a new founder to the spotlight
        </p>
      </div>

      <FounderForm action={createFounder} />
    </div>
  );
}
