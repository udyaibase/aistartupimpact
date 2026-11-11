import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ToolForm from '../ToolForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Add Indian AI Tool | Admin',
};

export default function NewToolPage() {
  async function createTool(formData: FormData) {
    'use server';

    const features = (formData.get('features') as string).split('\n').filter(Boolean);
    const useCases = (formData.get('useCases') as string).split('\n').filter(Boolean);
    const name = formData.get('name') as string;

    await prisma.indianAITool.create({
      data: {
        id: `indiatool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        tagline: formData.get('tagline') as string,
        description: formData.get('description') as string,
        logoUrl: formData.get('logoUrl') as string || null,
        websiteUrl: formData.get('websiteUrl') as string,
        category: formData.get('category') as string,
        foundedYear: parseInt(formData.get('foundedYear') as string) || null,
        fundingStatus: formData.get('fundingStatus') as string || null,
        totalFunding: formData.get('totalFunding') as string || null,
        headquarters: formData.get('headquarters') as string || null,
        teamSize: formData.get('teamSize') as string || null,
        features,
        useCases,
        isFeatured: formData.get('isFeatured') === 'on',
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/tools');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Add Indian AI Tool
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Add a new Made in India AI product
        </p>
      </div>

      <ToolForm action={createTool} />
    </div>
  );
}
