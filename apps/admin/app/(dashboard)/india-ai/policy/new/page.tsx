import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import PolicyForm from '../PolicyForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Add Policy Update | Admin',
};

export default function NewPolicyUpdatePage() {
  async function createPolicyUpdate(formData: FormData) {
    'use server';

    await prisma.policyUpdate.create({
      data: {
        id: `policy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        title: formData.get('title') as string,
        source: formData.get('source') as string,
        date: new Date(formData.get('date') as string),
        excerpt: formData.get('excerpt') as string,
        link: formData.get('link') as string,
        category: formData.get('category') as string,
        impact: formData.get('impact') as string,
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/policy');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Add Policy Update
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Create a new AI policy update or announcement
        </p>
      </div>

      <PolicyForm action={createPolicyUpdate} />
    </div>
  );
}
