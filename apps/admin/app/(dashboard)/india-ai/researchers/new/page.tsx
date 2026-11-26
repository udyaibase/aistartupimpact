import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ResearcherForm from '../ResearcherForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add AI Researcher | Admin',
};

export default function NewResearcherPage() {
  async function createResearcher(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    const researchAreas = f.lines('researchAreas');
    const notablePapers = f.lines('notablePapers');

    await prisma.aIResearcher.create({
      data: {
        id: `researcher_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: f.required('name', 300),
        university: f.text('university'),
        position: f.text('position'),
        photoUrl: f.optionalUrl('photoUrl'),
        bio: f.text('bio'),
        researchAreas,
        notablePapers,
        linkedinUrl: f.optionalUrl('linkedinUrl'),
        googleScholarUrl: f.optionalUrl('googleScholarUrl'),
        citations: f.int('citations'),
        hIndex: f.int('hIndex'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'INDIA_AI_RESEARCHER', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/researchers');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">
          Add AI Researcher
        </h1>
        <p className="portal-subtitle">
          Add a new AI researcher to the directory
        </p>
      </div>

      <ResearcherForm action={createResearcher} />
    </div>
  );
}
