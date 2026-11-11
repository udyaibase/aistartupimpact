import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import MissionForm from '../MissionForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Add Mission Pillar | Admin',
};

export default function NewMissionPillarPage() {
  async function createPillar(formData: FormData) {
    'use server';

    const allocatedCr = parseFloat(formData.get('budgetAllocatedCr') as string) || 0;
    const disbursedCr = parseFloat(formData.get('budgetDisbursedCr') as string) || 0;
    const keyInitiatives = (formData.get('keyInitiatives') as string).split('\n').filter(Boolean);

    await prisma.indiaAIMissionTracker.create({
      data: {
        component: formData.get('component') as string,
        budgetAllocated: BigInt(Math.round(allocatedCr * 10000000000)),
        budgetDisbursed: BigInt(Math.round(disbursedCr * 10000000000)),
        description: (formData.get('description') as string) || null,
        keyInitiatives,
        displayOrder: parseInt(formData.get('displayOrder') as string) || 0,
        isActive: formData.get('isActive') === 'on',
      },
    });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/mission-tracker');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add Mission Pillar</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Add a new pillar to the IndiaAI Mission Tracker</p>
      </div>
      <MissionForm action={createPillar} />
    </div>
  );
}
