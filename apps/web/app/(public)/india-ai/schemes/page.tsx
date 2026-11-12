import { Metadata } from 'next';
import Link from 'next/link';
import { jsonLd } from '@/lib/json-ld';
import { ChevronRight, IndianRupee, Rocket, Award, Briefcase } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Government AI Funding Schemes in India: IndiaAI, SISFS & MeitY',
  description: 'Government funding for AI startups in India — IndiaAI Mission, Startup India Seed Fund and MeitY grants, with eligibility, funding amounts and how to apply.',
  alternates: {
    canonical: 'https://udyaibase.com/india-ai/schemes',
  },
  openGraph: {
    title: 'Government AI Funding Schemes in India',
    url: 'https://udyaibase.com/india-ai/schemes',
    type: 'website',
    images: [{ url: '/og-image.webp', width: 2250, height: 1181 }],
  },
};

export default function GovernmentSchemesPage() {
  const schemes = [
    {
      slug: 'indiaai-mission',
      name: 'IndiaAI Mission',
      icon: Rocket,
      budget: '₹10,372 Crore',
      description: 'Comprehensive AI ecosystem initiative with compute infrastructure, innovation centers, and startup financing.',
      eligibility: 'AI startups, research institutions, and innovators',
      maxFunding: '₹10 Crore+',
      color: 'brand'
    },
    {
      slug: 'startup-india-seed-fund',
      name: 'Startup India Seed Fund (SISFS)',
      icon: Briefcase,
      budget: '₹945 Crore',
      description: 'Seed funding for early-stage startups through eligible incubators for proof of concept and market entry.',
      eligibility: 'DPIIT-recognized startups less than 2 years old',
      maxFunding: '₹70 Lakh',
      color: 'green-600'
    },
    {
      slug: 'meity-grants',
      name: 'MeitY Grants',
      icon: Award,
      budget: 'Multiple Schemes',
      description: 'Various grant programs from Ministry of Electronics and IT for product development and R&D.',
      eligibility: 'Indian startups working on electronics, IT, or AI',
      maxFunding: '₹1 Crore',
      color: 'purple-600'
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-0 sm:px-2 lg:px-4 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Government AI Funding Schemes in India',
        url: 'https://udyaibase.com/india-ai/schemes',
        numberOfItems: schemes.length,
        itemListElement: schemes.map((sc, i) => ({
          '@type': 'ListItem', position: i + 1, name: sc.name, url: `https://udyaibase.com/india-ai/schemes/${sc.slug}`,
        })),
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
          { '@type': 'ListItem', position: 2, name: 'India AI', item: 'https://udyaibase.com/india-ai' },
          { '@type': 'ListItem', position: 3, name: 'Funding Schemes', item: 'https://udyaibase.com/india-ai/schemes' },
        ],
      }) }} />
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/india-ai" className="hover:text-brand">India AI</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">Government Schemes</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 badge-brand mb-3 text-xs sm:text-xs">
          <IndianRupee className="w-3 h-3" /> Government Funding
        </div>
        <h1 className="font-sora font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy dark:text-white mb-4">
          Government AI Funding Schemes
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed">
          Explore government funding opportunities for AI startups in India. From seed funding to large-scale grants, find the right scheme for your startup.
        </p>
      </div>

      {/* Schemes Grid */}
      <div className="space-y-6">
        {schemes.map((scheme) => {
          const Icon = scheme.icon;
          return (
            <Link
              key={scheme.slug}
              href={`/india-ai/schemes/${scheme.slug}`}
              className="card p-6 sm:p-8 hover:shadow-xl transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl bg-${scheme.color}/10 flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-6 h-6 text-${scheme.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h2 className="font-sora font-bold text-xl text-navy dark:text-white group-hover:text-brand transition-colors">
                      {scheme.name}
                    </h2>
                    <span className="text-brand font-bold text-sm whitespace-nowrap ml-4">
                      {scheme.budget}
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                    {scheme.description}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Eligibility:</span>
                      <span className="text-navy dark:text-white ml-2">{scheme.eligibility}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Max Funding:</span>
                      <span className="text-navy dark:text-white ml-2">{scheme.maxFunding}</span>
                    </div>
                  </div>
                  <div className="mt-4 text-brand text-sm font-semibold group-hover:underline">
                    View Details & Apply →
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* CTA */}
      <div className="card p-6 sm:p-8 mt-8 bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-900">
        <h2 className="font-sora font-bold text-xl text-navy dark:text-white mb-3">
          Need Help Choosing?
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Not sure which scheme is right for your startup? Each scheme has different eligibility criteria, funding amounts, and application processes.
        </p>
        <Link href="/india-ai" className="btn-brand inline-flex items-center gap-2">
          Explore India AI Ecosystem
        </Link>
      </div>
    </div>
  );
}
