import { jsonLd } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star, Check, X as XIcon, ChevronRight, Zap, Shield, Smartphone, Globe, Calendar, DollarSign, ArrowRight } from 'lucide-react';
import { getAiToolBySlugDirect, getToolProsConsDirect, getSimilarToolsDirect } from '@/lib/db';

export const revalidate = 60;

// Pages are built on first visit and then cached (no list at build time); refreshed when content changes.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: { params: Promise<{ slugs: string }> }): Promise<Metadata> {
  const params = await props.params;
  const parts = params.slugs.split('-vs-');
  if (parts.length < 2 || parts.length > 3) return { title: 'Compare Tools' };
  const tools = await Promise.all(parts.map(s => getAiToolBySlugDirect(s)));
  if (tools.some(t => !t)) return { title: 'Compare Tools' };
  const names = tools.map((t: any) => t.name);
  const title = `${names.join(' vs ')}: Which Is Better in ${new Date().getFullYear()}?`;
  const description = `Compare ${names.join(' and ')} — features, pricing, pros & cons, ratings side by side.`;
  return { title, description, alternates: { canonical: `https://udyaibase.com/tools/compare/${params.slugs}` }, openGraph: { title, description } };
}

const PRICING_LABEL: Record<string, string> = {
  FREE: 'Free', FREEMIUM: 'Freemium', PAID: 'Paid', OPEN_SOURCE: 'Open Source', ENTERPRISE: 'Enterprise',
};

function bestValue(values: (number | null | undefined)[], higherIsBetter = true): number {
  const nums = values.map(v => (v != null ? Number(v) : NaN));
  if (nums.every(isNaN)) return -1;
  const valid = nums.map((n, i) => ({ n, i })).filter(x => !isNaN(x.n));
  valid.sort((a, b) => higherIsBetter ? b.n - a.n : a.n - b.n);
  if (valid.length >= 2 && valid[0].n === valid[1].n) return -1;
  return valid[0].i;
}

export default async function ComparePage(props: { params: Promise<{ slugs: string }> }) {
  const params = await props.params;
  const parts = params.slugs.split('-vs-');
  if (parts.length < 2 || parts.length > 3) notFound();

  const tools = await Promise.all(parts.map(s => getAiToolBySlugDirect(s)));
  if (tools.some(t => !t)) notFound();
  const tt = tools as any[];

  const prosConsData = await Promise.all(tt.map(t => getToolProsConsDirect(t.id)));

  const similarTools = tt[0].categoryId
    ? await getSimilarToolsDirect(tt[0].categoryId, tt[0].slug, 6 + tt.length)
    : [];

  const colClass = tt.length === 2 ? 'grid-cols-3' : 'grid-cols-4';

  const specRows: { label: string; icon: any; values: any[]; isBoolean?: boolean; higherIsBetter?: boolean }[] = [
    { label: 'Category', icon: Globe, values: tt.map(t => t.categoryName || '—') },
    { label: 'Pricing', icon: DollarSign, values: tt.map(t => PRICING_LABEL[t.pricingModel] || t.pricingModel) },
    { label: 'Starting Price', icon: DollarSign, values: tt.map(t => t.startingPrice ? `₹${t.startingPrice}/mo` : 'N/A') },
    { label: 'Rating', icon: Star, values: tt.map(t => t.avgRating ? parseFloat(t.avgRating).toFixed(1) : '—'), higherIsBetter: true },
    { label: 'Free Trial', icon: Calendar, values: tt.map(t => t.freeTrialDays ? `${t.freeTrialDays} days` : 'No'), higherIsBetter: true },
    { label: 'API Access', icon: Zap, values: tt.map(t => t.hasApi ? 'Yes' : 'No'), isBoolean: true },
    { label: 'Mobile App', icon: Smartphone, values: tt.map(t => t.hasMobileApp ? 'Yes' : 'No'), isBoolean: true },
    { label: 'HQ', icon: Globe, values: tt.map(t => t.headquartersCountry || '—') },
    { label: 'Launch Year', icon: Calendar, values: tt.map(t => t.launchYear || '—') },
  ];

  const sameRows = specRows.filter(r => {
    const v = r.values.map(String);
    return v.every(x => x === v[0]);
  });
  const diffRows = specRows.filter(r => {
    const v = r.values.map(String);
    return !v.every(x => x === v[0]);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/tools" className="hover:text-brand">Tools</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">Compare</span>
      </nav>

      <h1 className="font-sora font-extrabold text-2xl md:text-3xl text-navy dark:text-white mb-2">
        {tt.map(t => t.name).join(' vs ')}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mb-8">
        Side-by-side comparison to help you choose the right tool for your needs.
      </p>

      {/* ── Tool Header Cards ── */}
      <div className={`grid ${colClass} gap-4 mb-8`}>
        <div className="hidden md:block" />
        {tt.map((t, i) => (
          <div key={t.slug} className="flex flex-col items-center text-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            {t.logoUrl && (
              <Image src={t.logoUrl} alt="" width={48} height={48} sizes="48px" className="w-12 h-12 rounded-xl object-contain border border-gray-100 dark:border-gray-700 p-1 mb-3" />
            )}
            <Link href={`/tools/${t.slug}`} className="font-sora font-bold text-sm text-navy dark:text-white hover:text-brand transition-colors">
              {t.name}
            </Link>
            <p className="text-[10px] text-gray-400 font-jakarta mt-1 line-clamp-2">{t.tagline}</p>
            <div className="flex items-center gap-1 mt-2">
              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                {t.avgRating ? parseFloat(t.avgRating).toFixed(1) : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Key Differences ── */}
      {diffRows.length > 0 && (
        <section className="mb-8">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand" /> Key Differences
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className={`grid ${colClass}`}>
              {/* Header */}
              <div className="p-3 border-b border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <span className="text-[10px] font-bold text-gray-400 uppercase font-jakarta tracking-wider">Feature</span>
              </div>
              {tt.map((t) => (
                <div key={t.slug} className="p-3 border-b border-r last:border-r-0 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-center">
                  <span className="text-xs font-bold text-navy dark:text-white font-sora">{t.name}</span>
                </div>
              ))}

              {diffRows.map((row) => {
                const ratingIdx = row.higherIsBetter !== undefined
                  ? bestValue(row.values.map(v => {
                      const n = parseFloat(String(v));
                      return isNaN(n) ? null : n;
                    }), row.higherIsBetter)
                  : row.isBoolean
                  ? row.values.indexOf('Yes') !== -1 && row.values.filter(v => v === 'Yes').length === 1
                    ? row.values.indexOf('Yes')
                    : -1
                  : -1;

                return (
                  <SpecRow
                    key={row.label}
                    label={row.label}
                    icon={row.icon}
                    values={row.values}
                    isBoolean={row.isBoolean}
                    winnerIndex={ratingIdx}
                    colCount={tt.length}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Same Across Tools (collapsed) ── */}
      {sameRows.length > 0 && (
        <section className="mb-8">
          <details className="group">
            <summary className="cursor-pointer font-sora font-bold text-sm text-gray-500 dark:text-gray-400 mb-2 list-none flex items-center gap-2 hover:text-brand transition-colors">
              <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
              Same across all tools ({sameRows.length})
            </summary>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden mt-2">
              <div className={`grid ${colClass}`}>
                <div className="p-3 border-b border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-[10px] font-bold text-gray-400 uppercase font-jakarta tracking-wider">Feature</span>
                </div>
                {tt.map((t) => (
                  <div key={t.slug} className="p-3 border-b border-r last:border-r-0 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-center">
                    <span className="text-xs font-bold text-navy dark:text-white font-sora">{t.name}</span>
                  </div>
                ))}
                {sameRows.map(row => (
                  <SpecRow key={row.label} label={row.label} icon={row.icon} values={row.values} isBoolean={row.isBoolean} winnerIndex={-1} colCount={tt.length} />
                ))}
              </div>
            </div>
          </details>
        </section>
      )}

      {/* ── Key Features Comparison ── */}
      <section className="mb-8">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-3 flex items-center gap-2">
          <Zap className="w-5 h-5 text-brand" /> Key Features
        </h2>
        <div className={`grid grid-cols-1 ${tt.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
          {tt.map((t) => (
            <div key={t.slug} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">{t.name}</h3>
              <div className="space-y-2">
                {(t.keyFeatures as any[] || []).length > 0 ? (t.keyFeatures as any[]).map((f: any, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-brand mt-0.5 shrink-0" />
                    <span className="text-xs text-gray-600 dark:text-gray-300 font-jakarta">{f.text}</span>
                  </div>
                )) : (
                  <p className="text-xs text-gray-400 font-jakarta">No features listed</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pros & Cons Side by Side ── */}
      <section className="mb-8">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-3">Strengths & Limitations</h2>
        <div className={`grid grid-cols-1 ${tt.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
          {tt.map((t, i) => {
            const pc = prosConsData[i];
            return (
              <div key={t.slug} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white">{t.name}</h3>
                {/* Pros */}
                <div>
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-2 font-jakarta">Strengths</p>
                  <div className="space-y-1.5">
                    {(pc.pros as any[]).length > 0 ? (pc.pros as any[]).map((p: any) => (
                      <div key={p.id} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-300 font-jakarta">{p.text}</span>
                      </div>
                    )) : <p className="text-xs text-gray-400 font-jakarta">No strengths listed</p>}
                  </div>
                </div>
                {/* Cons */}
                <div>
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2 font-jakarta">Limitations</p>
                  <div className="space-y-1.5">
                    {(pc.cons as any[]).length > 0 ? (pc.cons as any[]).map((c: any) => (
                      <div key={c.id} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-300 font-jakarta">{c.text}</span>
                      </div>
                    )) : <p className="text-xs text-gray-400 font-jakarta">No limitations listed</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Use Cases ── */}
      {tt.some(t => (t.useCases as any[] || []).length > 0) && (
        <section className="mb-8">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-3">Best For</h2>
          <div className={`grid grid-cols-1 ${tt.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
            {tt.map((t) => (
              <div key={t.slug} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">{t.name}</h3>
                <div className="space-y-2">
                  {(t.useCases as any[] || []).length > 0 ? (t.useCases as any[]).map((uc: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-brand mt-0.5 shrink-0" />
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-jakarta">{uc.text}</span>
                    </div>
                  )) : (
                    <p className="text-xs text-gray-400 font-jakarta">No use cases listed</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA Row ── */}
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        {tt.map((t, i) => (
          <Link
            key={t.slug}
            href={`/tools/${t.slug}`}
            className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              i === 0
                ? 'bg-brand text-white hover:bg-brand/90'
                : 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            View {t.name}
          </Link>
        ))}
      </div>

      {/* ── Compare with other similar tools ── */}
      {similarTools.length > 0 && (
        <section className="mb-8">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-3">Compare with other tools</h2>
          <div className="flex flex-wrap gap-2">
            {(similarTools as any[])
              .filter((s: any) => !tt.find(t => t.slug === s.slug))
              .slice(0, 8)
              .map((s: any) => (
                <Link
                  key={s.slug}
                  href={`/tools/compare/${tt[0].slug}-vs-${s.slug}`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-brand/50 hover:shadow-sm transition-all text-xs font-jakarta"
                >
                  {s.logoUrl && (
                    <Image src={s.logoUrl} alt="" width={20} height={20} className="w-5 h-5 rounded object-contain" unoptimized />
                  )}
                  <span className="font-semibold text-navy dark:text-white">{tt[0].name} vs {s.name}</span>
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span className="text-gray-500">{s.avgRating ? parseFloat(s.avgRating).toFixed(1) : '—'}</span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: tt.map(t => t.name).join(' vs '),
        description: `Comparison of ${tt.map(t => t.name).join(' and ')}`,
      }) }} />
    </div>
  );
}

function SpecRow({ label, icon: Icon, values, isBoolean, winnerIndex, colCount }: {
  label: string; icon: any; values: any[]; isBoolean?: boolean; winnerIndex: number; colCount: number;
}) {
  return (
    <>
      <div className="px-3 py-2.5 border-b border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 font-jakarta">{label}</span>
      </div>
      {values.map((v, i) => (
        <div key={i} className={`px-3 py-2.5 border-b ${i < values.length - 1 ? 'border-r' : ''} border-gray-100 dark:border-gray-800 text-center ${
          winnerIndex === i ? 'bg-green-50/50 dark:bg-green-900/10' : ''
        }`}>
          {isBoolean ? (
            v === 'Yes'
              ? <Check className={`w-4 h-4 mx-auto ${winnerIndex === i ? 'text-green-600' : 'text-green-500'}`} />
              : <XIcon className="w-4 h-4 text-gray-300 dark:text-gray-600 mx-auto" />
          ) : (
            <span className={`text-xs font-jakarta font-semibold ${
              winnerIndex === i ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'
            }`}>
              {v}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
