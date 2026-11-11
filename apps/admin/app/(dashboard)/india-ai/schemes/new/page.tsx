import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import SchemeForm from '../SchemeForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Add Government Scheme | Admin',
};

export default function NewSchemePage() {
  async function createScheme(formData: FormData) {
    'use server';

    const eligibility = formData.get('eligibility') as string;
    const benefits = formData.get('benefits') as string;

    await prisma.governmentScheme.create({
      data: {
        id: `scheme_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: formData.get('name') as string,
        shortName: formData.get('shortName') as string,
        fundingAmount: formData.get('fundingAmount') as string,
        eligibility: eligibility.split('\n').filter(Boolean),
        applicationDeadline: formData.get('applicationDeadline') as string,
        status: formData.get('status') as string,
        applyLink: formData.get('applyLink') as string,
        description: formData.get('description') as string,
        benefits: benefits.split('\n').filter(Boolean),
        category: formData.get('category') as string,
        state: formData.get('state') as string || null,
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/schemes');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Add Government Scheme
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Create a new AI funding scheme or program
        </p>
      </div>

      <SchemeForm action={createScheme} />
    </div>
  );
}
