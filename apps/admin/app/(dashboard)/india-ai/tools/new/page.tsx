import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import ToolForm from '../ToolForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add Indian AI Tool | Admin',
};

export default function NewToolPage() {
  async function createTool(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    const features = f.lines('features');
    const useCases = f.lines('useCases');
    const name = f.required('name', 300);

    await prisma.indianAITool.create({
      data: {
        id: `indiatool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
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
        features,
        useCases,
        isFeatured: f.flag('isFeatured'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'INDIA_AI_TOOL', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/tools');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">
          Add Indian AI Tool
        </h1>
        <p className="portal-subtitle">
          Add a new Made in India AI product
        </p>
      </div>

      <ToolForm action={createTool} />
    </div>
  );
}
