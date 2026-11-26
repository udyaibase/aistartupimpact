import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import PolicyForm from '../PolicyForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add Policy Update | Admin',
};

export default function NewPolicyUpdatePage() {
  async function createPolicyUpdate(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    await prisma.policyUpdate.create({
      data: {
        id: `policy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        title: f.required('title', 300),
        source: f.text('source'),
        date: f.date('date'),
        excerpt: f.text('excerpt'),
        link: f.url('link'),
        category: f.text('category'),
        impact: f.text('impact'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'INDIA_AI_POLICY', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/policy');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">
          Add Policy Update
        </h1>
        <p className="portal-subtitle">
          Create a new AI policy update or announcement
        </p>
      </div>

      <PolicyForm action={createPolicyUpdate} />
    </div>
  );
}
