import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import FounderForm from '../../FounderForm';
import { refreshPublic } from '@/lib/refresh-public';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';

export const metadata: Metadata = {
  title: 'Edit featured founder | Admin',
};

export default async function EditFeaturedFounderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const item = await prisma.featuredFounder.findUnique({ where: { id } });
  if (!item) notFound();

  async function save(formData: FormData) {
    'use server';

    await requireFormAuth();
    const f = formFields(formData);

    await prisma.featuredFounder.update({
      where: { id },
      data: {
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

    await logAuditEvent({ action: 'UPDATE', resourceType: 'INDIA_AI_FOUNDER', resourceId: id, resourceName: String(formData.get('name') ?? formData.get('title') ?? formData.get('metricLabel') ?? formData.get('component') ?? '').slice(0, 200) });

    await refreshPublic(['india-ai', 'home']);

    redirect('/india-ai/founders');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Edit featured founder</h1>
        <p className="portal-subtitle">{item.name}</p>
      </div>
      <FounderForm action={save} initialData={item} />
    </div>
  );
}
