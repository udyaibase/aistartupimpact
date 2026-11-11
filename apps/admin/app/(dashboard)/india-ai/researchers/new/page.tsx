import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ResearcherForm from '../ResearcherForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Add AI Researcher | Admin',
};

export default function NewResearcherPage() {
  async function createResearcher(formData: FormData) {
    'use server';

    const researchAreas = (formData.get('researchAreas') as string).split('\n').filter(Boolean);
    const notablePapers = (formData.get('notablePapers') as string).split('\n').filter(Boolean);

    await prisma.aIResearcher.create({
      data: {
        id: `researcher_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: formData.get('name') as string,
        university: formData.get('university') as string,
        position: formData.get('position') as string,
        photoUrl: formData.get('photoUrl') as string || null,
        bio: formData.get('bio') as string,
        researchAreas,
        notablePapers,
        linkedinUrl: formData.get('linkedinUrl') as string || null,
        googleScholarUrl: formData.get('googleScholarUrl') as string || null,
        citations: parseInt(formData.get('citations') as string) || 0,
        hIndex: parseInt(formData.get('hIndex') as string) || 0,
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/researchers');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Add AI Researcher
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Add a new AI researcher to the directory
        </p>
      </div>

      <ResearcherForm action={createResearcher} />
    </div>
  );
}
