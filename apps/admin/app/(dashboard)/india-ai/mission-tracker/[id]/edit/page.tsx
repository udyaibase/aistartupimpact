import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import MissionForm from '../../MissionForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Edit Mission Pillar | Admin',
};

export default async function EditMissionPillarPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const pillar = await prisma.indiaAIMissionTracker.findUnique({
    where: { id: params.id },
  });

  if (!pillar) return notFound();

  async function updatePillar(formData: FormData) {
    'use server';

    const allocatedCr = parseFloat(formData.get('budgetAllocatedCr') as string) || 0;
    const disbursedCr = parseFloat(formData.get('budgetDisbursedCr') as string) || 0;
    const keyInitiatives = (formData.get('keyInitiatives') as string).split('\n').filter(Boolean);

    await prisma.indiaAIMissionTracker.update({
      where: { id: params.id },
      data: {
        component: formData.get('component') as string,
        budgetAllocated: BigInt(Math.round(allocatedCr * 10000000000)),
        budgetDisbursed: BigInt(Math.round(disbursedCr * 10000000000)),
        description: (formData.get('description') as string) || null,
        keyInitiatives,
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
        updatedAt: new Date(),
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/mission-tracker');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit: {pillar.component}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Update mission pillar details</p>
      </div>
      <MissionForm action={updatePillar} defaultValues={pillar} />
    </div>
  );
}
