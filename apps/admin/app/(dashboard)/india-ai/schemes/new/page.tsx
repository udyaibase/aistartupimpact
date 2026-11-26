import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import SchemeForm from '../SchemeForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add Government Scheme | Admin',
};

export default function NewSchemePage() {
  async function createScheme(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    const eligibility = f.text('eligibility');
    const benefits = f.text('benefits');

    await prisma.governmentScheme.create({
      data: {
        id: `scheme_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: f.required('name', 300),
        shortName: f.text('shortName'),
        fundingAmount: f.text('fundingAmount'),
        eligibility: eligibility.split('\n').filter(Boolean),
        applicationDeadline: f.text('applicationDeadline'),
        status: f.text('status'),
        applyLink: f.url('applyLink'),
        description: f.text('description'),
        benefits: benefits.split('\n').filter(Boolean),
        category: f.text('category'),
        state: f.optional('state'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'INDIA_AI_SCHEME', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/schemes');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">
          Add Government Scheme
        </h1>
        <p className="portal-subtitle">
          Create a new AI funding scheme or program
        </p>
      </div>

      <SchemeForm action={createScheme} />
    </div>
  );
}
