import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import MissionForm from '../MissionForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add Mission Pillar | Admin',
};

export default function NewMissionPillarPage() {
  async function createPillar(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    const allocatedCr = f.number('budgetAllocatedCr');
    const disbursedCr = f.number('budgetDisbursedCr');
    const keyInitiatives = f.lines('keyInitiatives');

    await prisma.indiaAIMissionTracker.create({
      data: {
        component: f.required('component', 300),
        budgetAllocated: BigInt(Math.round(allocatedCr * 10000000000)),
        budgetDisbursed: BigInt(Math.round(disbursedCr * 10000000000)),
        description: f.optional('description'),
        keyInitiatives,
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'INDIAAI_MISSION_TRACKER', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/mission-tracker');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">Add Mission Pillar</h1>
        <p className="portal-subtitle">Add a new pillar to the IndiaAI Mission Tracker</p>
      </div>
      <MissionForm action={createPillar} />
    </div>
  );
}
