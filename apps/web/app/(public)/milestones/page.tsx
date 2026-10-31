import { jsonLd } from "@/lib/json-ld";
import { Metadata } from 'next';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { generateBreadcrumbSchema } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Startup Milestones — Udyaibase',
  description: 'Track the latest milestones from Indian AI startups — funding rounds, product launches, partnerships, awards, and more.',
  alternates: { canonical: 'https://udyaibase.com/milestones' },
  openGraph: {
    title: 'Startup Milestones — Udyaibase',
    description: 'Track the latest milestones from Indian AI startups.',
    type: 'website',
    url: 'https://udyaibase.com/milestones',
    siteName: 'Udyaibase',
  },
};

export const revalidate = 120;

const ICONS: Record<string, string> = {
  FUNDING: '💰', LAUNCH: '🚀', PARTNERSHIP: '🤝', ACQUISITION: '🏢',
  AWARD: '🏆', HIRING: '👥', REVENUE: '📈', USER_MILESTONE: '🎯',
};

export default async function MilestonesPage() {
  let milestones: any[] = [];
  try {
    milestones = await sql`
      SELECT fm.id, fm.title, fm.description, fm.type, fm.amount, fm.currency,
             fm.date::text AS date, fm."verificationStatus",
             s.name AS "startupName", s.slug AS "startupSlug", s."logoUrl" AS "startupLogo"
      FROM "FounderMilestone" fm
      JOIN "Startup" s ON s.id = fm."startupId"
      WHERE fm.status = 'ACTIVE' AND fm."isPublic" = true
        AND s."isApproved" = true AND s."deletedAt" IS NULL
      ORDER BY fm.date DESC
      LIMIT 100
    `;
  } catch {}

  const siteUrl = 'https://udyaibase.com';
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'Milestones', url: `${siteUrl}/milestones` },
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mb-6 sm:mb-8">
        <h1 className="font-sora font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy dark:text-white leading-tight tracking-tight">
          Startup Milestones
        </h1>
        <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm max-w-2xl mt-2">
          Key achievements from AI startups — funding, launches, partnerships, and more.
        </p>
      </div>

      {milestones.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="text-sm font-jakarta text-gray-500 dark:text-gray-400">No milestones yet. Check back soon.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[23px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
          <div className="space-y-4">
            {milestones.map((m: any) => (
              <div key={m.id} className="flex items-start gap-4 relative">
                <div className="w-12 h-12 rounded-full bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-xl shrink-0 z-[1] hidden sm:flex">
                  {ICONS[m.type] || '📌'}
                </div>
                <div className="flex-1 card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-sora font-bold text-base text-navy dark:text-white flex items-center gap-2 flex-wrap">
                        <span className="sm:hidden text-lg">{ICONS[m.type] || '📌'}</span>
                        {m.title}
                        {m.verificationStatus === 'PLATFORM_VERIFIED' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-jakarta font-medium">Verified</span>
                        )}
                      </h2>
                      {m.description && <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">{m.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 font-jakarta flex-wrap">
                        <Link href={`/startups/${m.startupSlug}`} className="text-brand hover:underline font-medium">{m.startupName}</Link>
                        <span>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{m.type.replace('_', ' ')}</span>
                        {m.amount && <span className="font-medium text-gray-600 dark:text-gray-300">{m.currency} {Number(m.amount).toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
