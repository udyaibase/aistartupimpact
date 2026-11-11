import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ResearchHubForm from '../../ResearchHubForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Edit Research Institution | Admin',
};

export default async function EditResearchHubPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const institution = await prisma.aIResearchInstitution.findUnique({
    where: { id: params.id },
  });

  if (!institution) return notFound();

  const labs = (Array.isArray(institution.labs) ? institution.labs : []) as { name: string; description: string }[];

  async function updateInstitution(formData: FormData) {
    'use server';

    const researchAreas = (formData.get('researchAreas') as string).split('\n').filter(Boolean);
    const labsRaw = (formData.get('labs') as string).split('\n').filter(Boolean);
    const parsedLabs = labsRaw.map(line => {
      const [name, ...descParts] = line.split('|');
      return { name: name.trim(), description: descParts.join('|').trim() };
    });

    await prisma.aIResearchInstitution.update({
      where: { id: params.id },
      data: {
        name: formData.get('name') as string,
        city: formData.get('city') as string,
        state: formData.get('state') as string,
        tag: formData.get('tag') as string,
        category: formData.get('category') as string,
        aiCentre: (formData.get('aiCentre') as string) || null,
        dept: (formData.get('dept') as string) || null,
        faculty: (formData.get('faculty') as string) || null,
        students: (formData.get('students') as string) || null,
        programs: (formData.get('programs') as string) || null,
        fundedBy: (formData.get('fundedBy') as string) || null,
        bharatGen: (formData.get('bharatGen') as string) || null,
        appliedAI: (formData.get('appliedAI') as string) || null,
        researchAreas,
        labs: parsedLabs,
        link: formData.get('link') as string,
        linkLabel: formData.get('linkLabel') as string,
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/research-hubs');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit: {institution.name}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Update institution details</p>
      </div>
      <ResearchHubForm
        action={updateInstitution}
        defaultValues={{
          ...institution,
          labs,
        }}
      />
    </div>
  );
}
