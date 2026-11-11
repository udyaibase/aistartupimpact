import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import StatForm from '../StatForm';
import { refreshPublic } from '@/lib/refresh-public';

export const metadata: Metadata = {
  title: 'Add Live Stat | Admin',
};

export default function NewStatPage() {
  async function createStat(formData: FormData) {
    'use server';

    const metricKey = formData.get('metricKey') as string;
    const metricLabel = formData.get('metricLabel') as string;
    const metricValue = formData.get('metricValue') as string;
    if (!metricKey || !metricLabel || !metricValue) {
      throw new Error('Key, Label, and Value are required');
    }

    const metricChange = formData.get('metricChange') as string || null;
    const metricIcon = formData.get('metricIcon') as string || 'rocket';
    const displayOrder = parseInt(formData.get('displayOrder') as string) || 0;
    const isActive = formData.get('isActive') === 'on';

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

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/stats');
  }

  return (
    <div className="p-6">
      <div className="mb-6 font-jakarta">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-sora">
          Add Live Statistic
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Add a new live statistic counter to the India AI landing page hero section.
        </p>
      </div>

      <StatForm action={createStat} />
    </div>
  );
}
