import Link from 'next/link';
import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import StartupForm, { type CreatedStartup } from '@/components/founder/StartupForm';
import { founderAtStartupLimit, STARTUP_LIMIT_MESSAGE } from '@/lib/founder/limits';
import { emailMatchesDomain } from '@/lib/jobs/trust';
import { emailVerificationDomain } from '@/lib/startups/listing-domain';

export const metadata = { title: 'Add your startup' };

export default async function NewStartupPage(props: { searchParams: Promise<{ created?: string }> }) {
  const session = await requireFounderAuth();
  const { created: createdId } = await props.searchParams;

  // Just submitted: reopen on the Verify step for that startup (survives a refresh; Back can't reopen the form).
  if (createdId) {
    const s = await prisma.startup.findFirst({
      where: { id: createdId, ownerId: session.userId, deletedAt: null },
      select: { id: true, slug: true, name: true, websiteUrl: true, isVerified: true },
    });
    if (s) {
      const domain = emailVerificationDomain(s.websiteUrl);
      const me = await prisma.founderUser.findUnique({ where: { id: session.userId }, select: { email: true, companyEmail: true } });
      const workEmailHint = domain ? ([me?.companyEmail, me?.email].find((e): e is string => !!e && emailMatchesDomain(e, domain)) ?? null) : null;
      const created: CreatedStartup = {
        startupId: s.id, slug: s.slug, name: s.name, websiteUrl: s.websiteUrl ?? '', verified: s.isVerified, workEmailHint,
      };
      return (
        <div className="space-y-6 max-w-3xl">
          <div>
            <h1 className="portal-title">Add your startup</h1>
          </div>
          <StartupForm created={created} />
        </div>
      );
    }
  }

  // Check the limit before any typing, not at Submit.
  if (await founderAtStartupLimit(session.userId)) {
    return (
      <div className="space-y-6 max-w-3xl">
        <h1 className="portal-title">Add your startup</h1>
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">You’ve already added a startup</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">{STARTUP_LIMIT_MESSAGE}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link href="/founder/startups" className="btn-brand h-11 px-5 justify-center">Go to My startups</Link>
            <Link href="/founder/support" className="h-11 px-5 inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Contact Support</Link>
          </div>
        </div>
      </div>
    );
  }

  const user = await prisma.founderUser.findUnique({
    where: { id: session.userId },
    select: {
      name: true,
      email: true,
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="portal-title">Add your startup</h1>
        <p className="portal-subtitle">
          Five short steps, then verify your domain. Our team reviews new startups, usually within 2–3 business days.
        </p>
      </div>
      <StartupForm initialFounder={initialFounder} founderEmail={user?.email ?? ''} />
    </div>
  );
}
