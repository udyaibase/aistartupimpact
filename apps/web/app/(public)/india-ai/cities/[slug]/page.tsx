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

  if (!city) {
    return null;
  }

  // Get city deep dive data if exists
  const [deepDive] = await sql`
    SELECT * FROM "CityDeepDive"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;

  // Get startups from this city
  const startups = await sql`
    SELECT 
      id,
      name,
      slug,
      tagline,
      "logoUrl",
      stage,
      "totalFundingInr"
    FROM "Startup"
    WHERE "headquartersCity" = ${city.cityName}
      AND "isIndian" = true
      AND "deletedAt" IS NULL
    ORDER BY "totalFundingInr" DESC
    LIMIT 20
  `;

  return { city, deepDive, startups };
}

function formatCurrency(paise: number): string {
  const inr = paise / 100;
  const crores = inr / 10000000;
  if (crores >= 1) return `₹${Math.round(crores).toLocaleString('en-IN')}Cr`;
  const lakhs = inr / 100000;
  if (lakhs >= 1) return `₹${Math.round(lakhs)}L`;
  return `₹${Math.round(inr).toLocaleString('en-IN')}`;
}

export async function generateMetadata(props: CityPageProps): Promise<Metadata> {
  const params = await props.params;
  const data = await getCityData(params.slug);

  if (!data) {
    return {
      title: 'City Not Found',
    };
  }

  const { city } = data;

  return {
    title: `${city.cityName} AI Startups 2026 - ${city.totalStartups}+ Companies | AI Ecosystem`,
    description: `Discover ${city.totalStartups}+ AI startups in ${city.cityName}, ${city.state}. Total funding: ${formatCurrency(city.totalFunding)}. Explore top AI companies, sectors, accelerators, and ecosystem data.`,
    keywords: [
      `AI startups ${city.cityName}`,
      `${city.cityName} AI companies`,
      `AI ecosystem ${city.cityName}`,
      `${city.cityName} tech startups`,
      `AI funding ${city.cityName}`,
    ],
    openGraph: {
      title: `${city.cityName} AI Startups - ${city.totalStartups}+ Companies`,
      description: `${city.totalStartups}+ AI startups, ${formatCurrency(city.totalFunding)} total funding. Explore ${city.cityName}'s AI ecosystem.`,
      type: 'website',
    },
  };
}

export default async function CityPage(props: CityPageProps) {
  const params = await props.params;
  const data = await getCityData(params.slug);

  if (!data) {
    notFound();
  }

  const { city, deepDive, startups } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
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
              {city.cityName}
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              {city.state} • {deepDive?.tagline || 'AI Startup Hub'}
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
