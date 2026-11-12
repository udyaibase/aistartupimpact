import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { 
  MapPin, 
  Building2, 
  TrendingUp, 
  Users, 
  Briefcase,
  GraduationCap,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import { sql } from '@/lib/db';
import { INDIA_CITY_KEYS, MIN_CITY_STARTUPS } from '@/lib/india-hq';
import { jsonLd } from '@/lib/json-ld';

export const revalidate = 3600;

// Pages are built on first visit and then cached (no list at build time); refreshed when content changes.
export async function generateStaticParams() {
  return [];
}


interface CityPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getCityData(slug: string) {
  const [city] = await sql`
    SELECT * FROM "IndiaAICity"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;
  if (!city) return null;
  // The India AI section covers Indian cities only (Oslo, Dammam… are in the table from imports).
  if (!INDIA_CITY_KEYS.includes(String(city.cityName).trim().toLowerCase())) return null;

  const [deepDive] = await sql`
    SELECT * FROM "CityDeepDive"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;

  // Live numbers, matched the same way as the India AI map (name or alias, any case). The stored
  // totalStartups / totalFunding columns were never updated, so pages said "0+ companies".
  const names = [city.cityName, ...((city.aliases as string[] | null) ?? [])].map((n) => String(n).trim().toLowerCase());
  const [startups, [totals], stages] = await Promise.all([
    sql`
      SELECT id, name, slug, tagline, "logoUrl", stage, "totalFundingInr"
      FROM "Startup"
      WHERE LOWER(TRIM("headquartersCity")) = ANY(${names})
        AND "isApproved" = true AND "deletedAt" IS NULL
      ORDER BY "totalFundingInr" DESC NULLS LAST
      LIMIT 20
    `,
    sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM("totalFundingInr"), 0)::bigint AS funding
      FROM "Startup"
      WHERE LOWER(TRIM("headquartersCity")) = ANY(${names})
        AND "isApproved" = true AND "deletedAt" IS NULL
    `,
    sql`
      SELECT stage, COUNT(*)::int AS n
      FROM "Startup"
      WHERE LOWER(TRIM("headquartersCity")) = ANY(${names})
        AND "isApproved" = true AND "deletedAt" IS NULL AND stage IS NOT NULL
      GROUP BY stage ORDER BY n DESC LIMIT 3
    `,
  ]);

  const live: Record<string, any> = { ...(city as Record<string, any>), totalStartups: Number(totals?.count ?? 0), totalFunding: Number(totals?.funding ?? 0) };
  return { city: live, deepDive, startups, stages: stages as { stage: string; n: number }[] };
}

function formatCurrency(paise: number): string {
  const inr = paise / 100;
  const crores = inr / 10000000;
  if (crores >= 1) return `₹${Math.round(crores).toLocaleString('en-IN')}Cr`;
  const lakhs = inr / 100000;
  if (lakhs >= 1) return `₹${Math.round(lakhs)}L`;
  return `₹${Math.round(inr).toLocaleString('en-IN')}`;
}

const stageLabel = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export async function generateMetadata(props: CityPageProps): Promise<Metadata> {
  const params = await props.params;
  const data = await getCityData(params.slug);
  if (!data) return { title: 'City Not Found', robots: { index: false } };

  const { city, startups } = data;
  const year = new Date().getFullYear();
  const n = city.totalStartups;
  const title = `AI Startups in ${city.cityName} (${year}): ${n} Companies & Funding`;
  const top = (startups as any[]).slice(0, 3).map((s) => String(s.name).trim()).join(', ');
  const funding = city.totalFunding > 0 ? `, ${formatCurrency(city.totalFunding)} raised` : '';
  const description = n > 0
    ? `${n} AI startups in ${city.cityName}, ${city.state}${funding}. Top companies: ${top}. Stages, funding and founders on Udyaibase.`
    : `AI startups in ${city.cityName}, ${city.state}: companies, funding and the local AI ecosystem on Udyaibase.`;
  const url = `https://udyaibase.com/india-ai/cities/${params.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // Thin pages (a city with 0–2 startups) stay out of Google until they have something to show.
    robots: n >= MIN_CITY_STARTUPS ? undefined : { index: false, follow: true },
    openGraph: { title, description, url, type: 'website', images: [{ url: '/og-image.webp', width: 2250, height: 1181 }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-image.webp'] },
  };
}

export default async function CityPage(props: CityPageProps) {
  const params = await props.params;
  const data = await getCityData(params.slug);

  if (!data) {
    notFound();
  }

  const { city, deepDive, startups, stages } = data;
  const year = new Date().getFullYear();
  const pageUrl = `https://udyaibase.com/india-ai/cities/${params.slug}`;
  const topNames = (startups as any[]).slice(0, 3).map((s) => String(s.name).trim());
  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `AI Startups in ${city.cityName}`,
    url: pageUrl,
    about: { '@type': 'Place', name: `${city.cityName}, ${city.state}, India` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: city.totalStartups,
      itemListElement: (startups as any[]).map((s, i) => ({
        '@type': 'ListItem', position: i + 1, url: `https://udyaibase.com/startups/${s.slug}`, name: s.name,
      })),
    },
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
      { '@type': 'ListItem', position: 2, name: 'India AI', item: 'https://udyaibase.com/india-ai' },
      { '@type': 'ListItem', position: 3, name: city.cityName, item: pageUrl },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(listSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {/* Back Link */}
      <Link
        href="/india-ai"
        className="inline-flex items-center gap-2 text-brand hover:underline mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to India AI Ecosystem
      </Link>

      {/* City Header */}
      <div className="mb-8 sm:mb-12">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="font-sora font-extrabold text-3xl sm:text-4xl md:text-5xl text-navy dark:text-white mb-2">
              AI Startups in {city.cityName}
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              {city.state} • {deepDive?.tagline || 'AI Startup Hub'}
            </p>
            {/* A written summary from live data, so the page says something beyond a list of logos. */}
            <p className="mt-3 max-w-3xl font-jakarta text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
              {city.totalStartups > 0 ? (
                <>
                  Udyaibase tracks {city.totalStartups} AI startup{city.totalStartups === 1 ? '' : 's'} headquartered in {city.cityName}, {city.state}
                  {city.totalFunding > 0 ? <>, which together have raised {formatCurrency(city.totalFunding)}</> : null}.
                  {topNames.length > 0 ? <> The most funded include {topNames.join(', ')}.</> : null}
                  {stages.length > 0 ? <> Most are at the {stages.map((s) => stageLabel(s.stage)).join(', ')} stage{stages.length > 1 ? 's' : ''}.</> : null}
                  {' '}Below are the leading AI companies in {city.cityName} in {year}, with their funding and stage.
                </>
              ) : (
                <>We don&apos;t list any AI startups in {city.cityName} yet. Founders based here can add their startup for free.</>
              )}
            </p>
          </div>
          <MapPin className="w-8 h-8 text-brand" />
        </div>

        {city.description && (
          <p className="text-gray-600 dark:text-gray-300 max-w-3xl">
            {city.description}
          </p>
        )}
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-12">
        <div className="card p-5 text-center">
          <Building2 className="w-8 h-8 text-brand mx-auto mb-2" />
          <div className="text-3xl font-bold text-brand mb-1">
            {city.totalStartups.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">AI Startups</div>
        </div>

        <div className="card p-5 text-center">
          <TrendingUp className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
          <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
            {formatCurrency(city.totalFunding)}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Funding</div>
        </div>

        {city.averageTeamSize && (
          <div className="card p-5 text-center">
            <Users className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
              {city.averageTeamSize}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Avg Team Size</div>
          </div>
        )}

        {city.averageFunding && (
          <div className="card p-5 text-center">
            <Briefcase className="w-8 h-8 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
              {formatCurrency(city.averageFunding)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Avg Funding</div>
          </div>
        )}
      </div>

      {/* Top Sectors */}
      {city.topSectors && city.topSectors.length > 0 && (
        <div className="mb-12">
          <h2 className="section-title mb-6">Top AI Sectors</h2>
          <div className="flex flex-wrap gap-3">
            {city.topSectors.map((sector: string, idx: number) => (
              <div
                key={idx}
                className="card px-6 py-3 hover:shadow-lg transition-shadow"
              >
                <span className="font-semibold text-brand">{sector}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Accelerators */}
      {city.keyAccelerators && city.keyAccelerators.length > 0 && (
        <div className="mb-12">
          <h2 className="section-title mb-6">
            <GraduationCap className="w-6 h-6" />
            Key Accelerators & Incubators
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {city.keyAccelerators.map((accelerator: string, idx: number) => (
              <div key={idx} className="card p-4">
                <div className="font-semibold text-navy dark:text-white">{accelerator}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notable Companies */}
      {city.notableCompanies && city.notableCompanies.length > 0 && (
        <div className="mb-12">
          <h2 className="section-title mb-6">
            <Building2 className="w-6 h-6" />
            Major AI Companies & Offices
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {city.notableCompanies.map((company: string, idx: number) => (
              <div key={idx} className="card p-4 text-center">
                <div className="font-semibold text-navy dark:text-white">{company}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Startups */}
      {startups.length > 0 && (
        <div className="mb-12">
          <h2 className="section-title mb-6">
            <Building2 className="w-6 h-6" />
            Top AI Startups in {city.cityName}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {startups.map((startup: any) => (
              <Link
                key={startup.id}
                href={`/startups/${startup.slug}`}
                className="group card p-5 hover:shadow-xl transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    {startup.logoUrl ? (
                      <img
                        src={startup.logoUrl}
                        alt={startup.name}
                        className="w-10 h-10 object-contain"
                      />
                    ) : (
                      <Building2 className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-sora font-bold text-base text-navy dark:text-white group-hover:text-brand transition-colors line-clamp-1">
                      {startup.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {startup.tagline}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {startup.stage}
                  </span>
                  {startup.totalFundingInr > 0 && (
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(startup.totalFundingInr)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-6">
            <Link
              href={`/startups?city=${city.cityName}`}
              className="inline-flex items-center gap-2 text-brand font-semibold hover:underline"
            >
              View All {city.cityName} Startups
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Deep Dive Data */}
      {deepDive && (
        <>
          {deepDive.longDescription && (
            <div className="mb-12">
              <h2 className="section-title mb-6">About {city.cityName}&apos;s AI Ecosystem</h2>
              <div className="card p-6">
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {deepDive.longDescription}
                </p>
              </div>
            </div>
          )}

          {/* Additional Deep Dive Sections */}
          {deepDive.topUniversities && deepDive.topUniversities.length > 0 && (
            <div className="mb-12">
              <h2 className="section-title mb-6">
                <GraduationCap className="w-6 h-6" />
                Top Universities
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {deepDive.topUniversities.map((uni: string, idx: number) => (
                  <div key={idx} className="card p-4">
                    <div className="font-semibold text-navy dark:text-white">{uni}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
