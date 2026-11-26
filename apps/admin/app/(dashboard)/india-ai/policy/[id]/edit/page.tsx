import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import PolicyForm from '../../PolicyForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Edit policy update | Admin',
};

export default async function EditPolicyUpdatePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const item = await prisma.policyUpdate.findUnique({ where: { id } });
  if (!item) notFound();

  async function save(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    await prisma.policyUpdate.update({
      where: { id },
      data: {
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

    await logAuditEvent({ action: 'UPDATE', resourceType: 'INDIA_AI_POLICY', resourceId: id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/policy');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Edit policy update</h1>
        <p className="portal-subtitle">{item.title}</p>
      </div>
      <PolicyForm action={save} initialData={item} />
    </div>
  );
}
