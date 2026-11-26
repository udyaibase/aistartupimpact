import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ResearchHubForm from '../../ResearchHubForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Edit Research Institution | Admin',
};

export default async function EditResearchHubPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const institution = await prisma.aIResearchInstitution.findUnique({
    where: { id: params.id },
  });

  if (!institution) return notFound();

  const labs = (Array.isArray(institution.labs) ? institution.labs : []) as { name: string; description: string }[];

  async function updateInstitution(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    const researchAreas = f.lines('researchAreas');
    const labsRaw = f.lines('labs');
    const parsedLabs = labsRaw.map(line => {
      const [name, ...descParts] = line.split('|');
      return { name: name.trim(), description: descParts.join('|').trim() };
    });

    await prisma.aIResearchInstitution.update({
      where: { id: params.id },
      data: {
        name: f.required('name', 300),
        city: f.text('city'),
        state: f.text('state'),
        tag: f.text('tag'),
        category: f.text('category'),
        aiCentre: f.optional('aiCentre'),
        dept: f.optional('dept'),
        faculty: f.optional('faculty'),
        students: f.optional('students'),
        programs: f.optional('programs'),
        fundedBy: f.optional('fundedBy'),
        bharatGen: f.optional('bharatGen'),
        appliedAI: f.optional('appliedAI'),
        researchAreas,
        labs: parsedLabs,
        link: f.url('link'),
        linkLabel: f.text('linkLabel'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'UPDATE', resourceType: 'AI_RESEARCH_INSTITUTION', resourceId: params.id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/research-hubs');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">Edit: {institution.name}</h1>
        <p className="portal-subtitle">Update institution details</p>
      </div>
      <ResearchHubForm
        action={updateInstitution}
        defaultValues={{
          ...institution,
          labs,
        }}
      />
    </div>
  );
}
