import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ResearcherForm from '../../ResearcherForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Edit researcher | Admin',
};

export default async function EditResearcherPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const item = await prisma.aIResearcher.findUnique({ where: { id } });
  if (!item) notFound();

  async function save(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    await prisma.aIResearcher.update({
      where: { id },
      data: {
        name: f.required('name', 300),
        university: f.text('university'),
        position: f.text('position'),
        photoUrl: f.optionalUrl('photoUrl'),
        bio: f.text('bio'),
        researchAreas: f.lines('researchAreas'),
        notablePapers: f.lines('notablePapers'),
        linkedinUrl: f.optionalUrl('linkedinUrl'),
        googleScholarUrl: f.optionalUrl('googleScholarUrl'),
        citations: f.int('citations'),
        hIndex: f.int('hIndex'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'UPDATE', resourceType: 'INDIA_AI_RESEARCHER', resourceId: id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/researchers');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Edit researcher</h1>
        <p className="portal-subtitle">{item.name}</p>
      </div>
      <ResearcherForm action={save} initialData={item} />
    </div>
  );
}
