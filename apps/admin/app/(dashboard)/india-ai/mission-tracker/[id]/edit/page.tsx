import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import MissionForm from '../../MissionForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

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

    await requireFormAuth();
    const f = formFields(formData);

    const allocatedCr = f.number('budgetAllocatedCr');
    const disbursedCr = f.number('budgetDisbursedCr');
    const keyInitiatives = f.lines('keyInitiatives');

    await prisma.indiaAIMissionTracker.update({
      where: { id: params.id },
      data: {
        component: f.required('component', 300),
        budgetAllocated: BigInt(Math.round(allocatedCr * 10000000000)),
        budgetDisbursed: BigInt(Math.round(disbursedCr * 10000000000)),
        description: f.optional('description'),
        keyInitiatives,
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
        updatedAt: new Date(),
      },
    });

    await logAuditEvent({ action: 'UPDATE', resourceType: 'INDIAAI_MISSION_TRACKER', resourceId: params.id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/mission-tracker');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">Edit: {pillar.component}</h1>
        <p className="portal-subtitle">Update mission pillar details</p>
      </div>
      <MissionForm action={updatePillar} defaultValues={pillar} />
    </div>
  );
}
