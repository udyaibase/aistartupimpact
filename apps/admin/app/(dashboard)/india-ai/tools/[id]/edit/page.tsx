import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ToolForm from '../../ToolForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Edit Indian AI tool | Admin',
};

export default async function EditIndianToolPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const item = await prisma.indianAITool.findUnique({ where: { id } });
  if (!item) notFound();

  async function save(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    await prisma.indianAITool.update({
      where: { id },
      data: {
        // The slug is the tool's public address, so it stays as it was when the name changes.
        name: f.required('name', 300),
        tagline: f.text('tagline'),
        description: f.text('description'),
        logoUrl: f.optionalUrl('logoUrl'),
        websiteUrl: f.url('websiteUrl'),
        category: f.text('category'),
        foundedYear: f.intOrNull('foundedYear', 1800, 2100),
        fundingStatus: f.optional('fundingStatus'),
        totalFunding: f.optional('totalFunding'),
        headquarters: f.optional('headquarters'),
        teamSize: f.optional('teamSize'),
        features: f.lines('features'),
        useCases: f.lines('useCases'),
        isFeatured: f.flag('isFeatured'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'UPDATE', resourceType: 'INDIA_AI_TOOL', resourceId: id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/tools');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Edit Indian AI tool</h1>
        <p className="portal-subtitle">{item.name}</p>
      </div>
      <ToolForm action={save} initialData={item} />
    </div>
  );
}
