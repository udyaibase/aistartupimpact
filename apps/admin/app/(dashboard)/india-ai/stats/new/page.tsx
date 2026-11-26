import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import StatForm from '../StatForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add Live Stat | Admin',
};

export default function NewStatPage() {
  async function createStat(formData: FormData) {
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

    await prisma.indiaAIStats.create({
      data: {
        metricKey,
        metricLabel,
        metricValue,
        metricChange,
        metricIcon,
        displayOrder,
        isActive,
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'INDIA_AI_STATS', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/stats');
  }

  return (
    <div className="p-6">
      <div className="mb-6 font-jakarta">
        <h1 className="portal-title">
          Add Live Statistic
        </h1>
        <p className="portal-subtitle">
          Add a new live statistic counter to the India AI landing page hero section.
        </p>
      </div>

      <StatForm action={createStat} />
    </div>
  );
}
