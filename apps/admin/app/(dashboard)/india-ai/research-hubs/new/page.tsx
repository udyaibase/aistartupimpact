import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ResearchHubForm from '../ResearchHubForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add Research Institution | Admin',
};

export default function NewResearchHubPage() {
  async function createInstitution(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    const researchAreas = f.lines('researchAreas');
    const labsRaw = f.lines('labs');
    const labs = labsRaw.map(line => {
      const [name, ...descParts] = line.split('|');
      return { name: name.trim(), description: descParts.join('|').trim() };
    });

    await prisma.aIResearchInstitution.create({
      data: {
        id: `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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
        labs,
        link: f.url('link'),
        linkLabel: f.text('linkLabel'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'AI_RESEARCH_INSTITUTION', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/research-hubs');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">Add Research Institution</h1>
        <p className="portal-subtitle">Add a new AI research institution or centre</p>
      </div>
      <ResearchHubForm action={createInstitution} />
    </div>
  );
}
