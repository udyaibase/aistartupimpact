import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import StatForm from '../../StatForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

interface EditStatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata: Metadata = {
  title: 'Edit Live Stat | Admin',
};

export default async function EditStatPage(props: EditStatPageProps) {
  const params = await props.params;
  const stat = await prisma.indiaAIStats.findUnique({
    where: { id: params.id },
  });

  if (!stat) {
    notFound();
  }

  const normalizedStat = {
    metricKey: stat.metricKey,
    metricLabel: stat.metricLabel,
    metricValue: stat.metricValue,
    metricChange: stat.metricChange,
    metricIcon: stat.metricIcon,
    displayOrder: stat.displayOrder,
    isActive: stat.isActive ?? true,
  };

  async function updateStat(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    const metricKey = f.required('metricKey', 300);
    const metricLabel = f.required('metricLabel', 300);
    const metricValue = f.required('metricValue', 300);
    if (!metricKey || !metricLabel || !metricValue) {
      throw new Error('Key, Label, and Value are required');
    }

    const metricChange = f.optional('metricChange');
    const metricIcon = f.optional('metricIcon', 40) ?? 'rocket';
    const displayOrder = f.int('displayOrder');
    const isActive = f.flag('isActive');

    await prisma.indiaAIStats.update({
      where: { id: params.id },
      data: {
        metricKey,
        metricLabel,
        metricValue,
        metricChange,
        metricIcon,
        displayOrder,
        isActive,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      },
    });

    await logAuditEvent({ action: 'UPDATE', resourceType: 'INDIA_AI_STATS', resourceId: params.id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/stats');
  }

  return (
    <div className="p-6">
      <div className="mb-6 font-jakarta">
        <h1 className="portal-title">
          Edit Statistic: {stat.metricLabel}
        </h1>
        <p className="portal-subtitle">
          Update the display label, value, key, icon, display order, or active status.
        </p>
      </div>

      <StatForm action={updateStat} initialData={normalizedStat} />
    </div>
  );
}
