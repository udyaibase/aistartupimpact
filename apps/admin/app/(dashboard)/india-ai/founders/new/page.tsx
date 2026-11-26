import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import FounderForm from '../FounderForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Add Featured Founder | Admin',
};

export default function NewFounderPage() {
  async function createFounder(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    await prisma.featuredFounder.create({
      data: {
        id: `founder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: f.required('name', 300),
        startupName: f.text('startupName'),
        startupSlug: f.optional('startupSlug'),
        photoUrl: f.optionalUrl('photoUrl'),
        bio: f.text('bio'),
        achievement: f.text('achievement'),
        fundingRaised: f.optional('fundingRaised'),
        category: f.text('category'),
        linkedinUrl: f.optionalUrl('linkedinUrl'),
        twitterUrl: f.optionalUrl('twitterUrl'),
        storyUrl: f.optionalUrl('storyUrl'),
        displayOrder: f.int('displayOrder'),
        isActive: f.flag('isActive'),
      },
    });

    await logAuditEvent({ action: 'CREATE', resourceType: 'INDIA_AI_FOUNDER', resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/founders');
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="portal-title">
          Add Featured Founder
        </h1>
        <p className="portal-subtitle">
          Add a new founder to the spotlight
        </p>
      </div>

      <FounderForm action={createFounder} />
    </div>
  );
}
