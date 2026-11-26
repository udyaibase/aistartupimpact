import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import SchemeForm from '../../SchemeForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Edit government scheme | Admin',
};

export default async function EditSchemePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const item = await prisma.governmentScheme.findUnique({ where: { id } });
  if (!item) notFound();

  async function save(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    await prisma.governmentScheme.update({
      where: { id },
      data: {
        name: f.required('name', 300),
        shortName: f.text('shortName'),
        fundingAmount: f.text('fundingAmount'),
        eligibility: f.text('eligibility').split('\n').filter(Boolean),
        applicationDeadline: f.text('applicationDeadline'),
        status: f.text('status'),
        applyLink: f.url('applyLink'),
        description: f.text('description'),
        benefits: f.text('benefits').split('\n').filter(Boolean),
        category: f.text('category'),
        state: f.optional('state'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'UPDATE', resourceType: 'INDIA_AI_SCHEME', resourceId: id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/schemes');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Edit government scheme</h1>
        <p className="portal-subtitle">{item.name}</p>
      </div>
      <SchemeForm action={save} initialData={item} />
    </div>
  );
}
