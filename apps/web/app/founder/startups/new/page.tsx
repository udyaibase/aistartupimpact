import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { redirect } from 'next/navigation';
import StartupForm from '@/components/founder/StartupForm';
import { founderAtStartupLimit } from '@/lib/founder/limits';

export default async function NewStartupPage() {
  const session = await requireFounderAuth();
  if (await founderAtStartupLimit(session.userId)) redirect('/founder/startups');

  const user = await prisma.founderUser.findUnique({
    where: { id: session.userId },
    select: {
      name: true,
      role: true,
      previousCompany: true,
      bio: true,
      avatar: true,
      linkedin: true,
      twitter: true,
    },
  });

  const initialFounder = user ? {
    name: user.name,
    role: user.role || 'Founder',
    prev: user.previousCompany || '',
    bio: user.bio || '',
    avatar: user.avatar || '',
    linkedin: user.linkedin || '',
    twitter: user.twitter || '',
  } : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="portal-title">
          Submit Your Startup
        </h1>
        <p className="portal-subtitle">
          Share your startup with the AI community. Our team will review your submission within 2-3 business days.
        </p>
      </div>

      {/* Form */}
      <StartupForm initialFounder={initialFounder} />
    </div>
  );
}
