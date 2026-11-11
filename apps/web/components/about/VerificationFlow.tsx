import { UserPlus, Globe, BadgeCheck, LayoutGrid, Briefcase, Calendar, BookOpen, Wrench, TrendingUp } from 'lucide-react';
import SectionHeader from './SectionHeader';

const STEPS = [
  { icon: UserPlus, title: 'Founder Signs Up', desc: 'Create a free founder account' },
  { icon: Globe, title: 'Verify Domain', desc: "Add one DNS record to your startup's website" },
  { icon: BadgeCheck, title: 'Startup Verified', desc: 'Your profile gets the verified badge' },
  { icon: LayoutGrid, title: 'All Portals Open', desc: 'Every product unlocks under one login' },
];

const UNLOCKS = [
  { icon: Briefcase, label: 'Post Jobs' },
  { icon: Calendar, label: 'Host Events' },
  { icon: BookOpen, label: 'Publish Stories' },
  { icon: Wrench, label: 'Submit Tools' },
  { icon: TrendingUp, label: 'Track Funding' },
];

export default function VerificationFlow() {
  return (
    <section aria-labelledby="verification-heading">
      <SectionHeader
        id="verification-heading"
        eyebrow="How it works"
        title={<>One Verification. <span className="text-brand">Everything Unlocks.</span></>}
        subtitle="Prove you run the startup once — then hire, host, publish and track from a single account."
      />

      <ol className="relative grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
        {/* Connector behind the step badges (desktop) */}
        <span
          className="hidden md:block absolute top-7 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-[color:color-mix(in_srgb,var(--brand-color)_45%,transparent)] to-transparent"
          aria-hidden="true"
        />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex md:flex-col items-start md:items-center gap-4 md:gap-0 md:text-center">
            {/* Connector between stacked steps (mobile) */}
            {i < STEPS.length - 1 && (
              <span className="md:hidden absolute left-7 top-14 -bottom-4 w-px bg-[color:color-mix(in_srgb,var(--brand-color)_30%,transparent)]" aria-hidden="true" />
            )}
            <span
              className={`relative z-10 w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center border ${i === STEPS.length - 1
                ? 'bg-brand text-white border-transparent shadow-[0_10px_30px_-10px_color-mix(in_srgb,var(--brand-color)_80%,transparent)]'
                : 'bg-white dark:bg-gray-950 text-brand border-[color:color-mix(in_srgb,var(--brand-color)_30%,transparent)]'}`}
            >
              <s.icon className="w-6 h-6" aria-hidden="true" />
            </span>
            <div className="pb-2 md:pb-0 md:mt-5">
              <span className="font-sora text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Step {i + 1}</span>
              <h3 className="mt-1 font-sora font-bold text-base text-navy dark:text-white">{s.title}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 font-jakarta leading-relaxed md:max-w-[200px] md:mx-auto">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 sm:mt-12 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
        <p className="shrink-0 font-sora text-xs font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 lg:pl-1">
          What unlocks
        </p>
        <ul className="flex flex-wrap gap-2">
          {UNLOCKS.map((u) => (
            <li
              key={u.label}
              className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--brand-color)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-color)_6%,transparent)] px-3.5 py-1.5 font-jakarta text-sm font-semibold text-navy dark:text-white"
            >
              <u.icon className="w-4 h-4 text-brand" aria-hidden="true" />
              {u.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
