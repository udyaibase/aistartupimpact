import { RefreshCw, Search, Linkedin } from 'lucide-react';
import SectionHeader from './SectionHeader';

const LOOPS = [
  {
    icon: Search,
    title: 'Search Discovery Loop',
    tagline: 'Content brings people in from Google',
    steps: [
      'Google Search',
      'AI news & stories',
      'Tagged startup profiles',
      'Explore jobs, tools, events, funding',
      'Sign up',
      'More data',
      'More search traffic',
    ],
  },
  {
    icon: Linkedin,
    title: 'LinkedIn Distribution Loop',
    tagline: 'Our community carries every story further',
    steps: [
      'Hook posts (50K+ followers)',
      'Full story on website',
      'Explore startup profiles',
      'Subscribe to weekly digest',
      'Return visits & shares',
    ],
  },
];

export default function GrowthLoops() {
  return (
    <section aria-labelledby="growth-heading">
      <SectionHeader
        id="growth-heading"
        eyebrow="Growth"
        title={<>The <span className="text-brand">Growth Engine</span></>}
        subtitle="Two loops that feed each other — every story, profile and sign-up makes the next visit more valuable."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {LOOPS.map((loop) => (
          <div
            key={loop.title}
            className="relative rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden flex flex-col"
          >
            <div className="h-1 bg-gradient-to-r from-brand via-[color:color-mix(in_srgb,var(--brand-color)_50%,transparent)] to-transparent" aria-hidden="true" />
            <div className="p-5 sm:p-7 flex flex-col flex-1">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-brand text-white shadow-[0_8px_24px_-10px_color-mix(in_srgb,var(--brand-color)_80%,transparent)]">
                  <loop.icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">{loop.title}</h3>
                  <p className="font-jakarta text-xs sm:text-sm text-gray-500 dark:text-gray-400">{loop.tagline}</p>
                </div>
              </div>

              <ol className="mt-6 flex-1">
                {loop.steps.map((step, i) => (
                  <li key={step} className="relative flex items-start gap-3 pb-3 last:pb-0">
                    {i < loop.steps.length - 1 && (
                      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-[color:color-mix(in_srgb,var(--brand-color)_25%,transparent)]" aria-hidden="true" />
                    )}
                    <span className="relative z-10 w-6 h-6 shrink-0 rounded-full flex items-center justify-center bg-[color:color-mix(in_srgb,var(--brand-color)_12%,transparent)] text-brand font-sora text-[11px] font-bold">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 font-jakarta text-sm text-gray-700 dark:text-gray-300">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-5 flex items-center gap-2 rounded-xl bg-[color:color-mix(in_srgb,var(--brand-color)_8%,transparent)] px-4 py-3 font-jakarta text-sm font-semibold text-brand">
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
                Cycle repeats — compounding growth
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
