'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, Newspaper, Wrench, Briefcase, TrendingUp, Calendar, Landmark, Check, Minus, type LucideIcon } from 'lucide-react';
import SectionHeader from './SectionHeader';

type Spoke = { label: string; href: string; icon: LucideIcon; desc: string };

const SPOKES: Spoke[] = [
  { label: 'News & Stories', href: '/stories', icon: Newspaper, desc: 'Founder stories and AI news that tag and link every startup they mention' },
  { label: 'AI Tools', href: '/tools', icon: Wrench, desc: 'Independent AI tool reviews, each tool linked to the startup that builds it' },
  { label: 'AI Jobs', href: '/jobs', icon: Briefcase, desc: 'Direct hiring with AI-powered candidate screening' },
  { label: 'Funding Dashboard', href: '/funding', icon: TrendingUp, desc: "Every funding round tracked and tied to the startup's profile" },
  { label: 'Events Platform', href: '/events', icon: Calendar, desc: 'AI meetups, hackathons and conferences, with registration built in' },
  { label: 'India AI Hub', href: '/india-ai', icon: Landmark, desc: "Government schemes, policy and research shaping India's AI ecosystem" },
];

// Diagram space is 600×600 with the hub at the centre; spokes sit on a circle, starting at the top.
const SIZE = 600;
const C = SIZE / 2;
const R = 228;
const points = SPOKES.map((_, i) => {
  const a = ((-90 + i * 60) * Math.PI) / 180;
  return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
});
const pct = (v: number) => `${(v / SIZE) * 100}%`;

const COMPARISON = [
  { name: 'Tracxn', what: 'Only data' },
  { name: 'Crunchbase', what: 'Only profiles' },
  { name: 'Naukri', what: 'Only jobs' },
];

export default function EcosystemHub() {
  const [active, setActive] = useState<number | null>(null);
  // A touch tap first reveals the description; a second tap on the same node follows the link.
  const lastPointer = useRef<string>('mouse');

  return (
    <section aria-labelledby="ecosystem-heading" className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 lg:gap-14 items-center">
      <div>
        <SectionHeader
          id="ecosystem-heading"
          align="left"
          eyebrow="The Ecosystem"
          title={<>Six products. <span className="text-brand">One startup profile</span> at the centre.</>}
          subtitle="Everything on Udyaibase links back to a startup's profile — so news, tools, jobs, funding and events all add up."
        />
        {/* Comparison */}
        <ul className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 font-jakarta text-sm overflow-hidden">
          {COMPARISON.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3">
              <span className="font-semibold text-gray-700 dark:text-gray-300">{c.name}</span>
              <span className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                {c.what}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 bg-[color:color-mix(in_srgb,var(--brand-color)_7%,transparent)]">
            <span className="font-sora font-bold text-brand">Udyaibase</span>
            <span className="flex items-center gap-2 font-semibold text-navy dark:text-white">
              <Check className="w-4 h-4 text-brand" aria-hidden="true" />
              Everything. Connected.
            </span>
          </li>
        </ul>
      </div>

      <div className="relative rounded-3xl border border-[color:color-mix(in_srgb,var(--brand-color)_18%,transparent)] bg-white dark:bg-gray-950 px-2 py-4 sm:p-8 overflow-hidden shadow-[0_30px_80px_-40px_color-mix(in_srgb,var(--brand-color)_45%,transparent)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--brand-color)_10%,transparent),transparent_65%)] pointer-events-none" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[540px] aspect-square">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
            <circle cx={C} cy={C} r={R} fill="none" className="stroke-gray-200 dark:stroke-gray-800" strokeWidth="1" />
            {points.map((p, i) => (
              <line
                key={i}
                x1={p.x}
                y1={p.y}
                x2={C}
                y2={C}
                strokeWidth={active === i ? 2.5 : 1.5}
                strokeDasharray="6 4"
                strokeLinecap="round"
                className={`dash-flow transition-[stroke,stroke-width] duration-300 ${active === i ? 'stroke-brand' : 'stroke-gray-300 dark:stroke-gray-700'}`}
              />
            ))}
          </svg>

          {/* Hub */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 w-[30%] aspect-square rounded-full flex flex-col items-center justify-center text-center bg-white dark:bg-gray-950 border-2 border-[color:color-mix(in_srgb,var(--brand-color)_45%,transparent)] shadow-[0_0_40px_-10px_color-mix(in_srgb,var(--brand-color)_55%,transparent)]"
            style={{ left: '50%', top: '50%' }}
          >
            <Building2 className="w-5 h-5 sm:w-7 sm:h-7 text-brand mb-0.5 sm:mb-1" aria-hidden="true" />
            <span className="font-sora font-bold text-[10px] sm:text-sm leading-tight text-navy dark:text-white">Startup<br />Profile</span>
          </div>

          {/* Spokes */}
          {SPOKES.map((s, i) => {
            const on = active === i;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-describedby={on ? 'ecosystem-desc' : undefined}
                onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={(e) => {
                  if (lastPointer.current !== 'mouse' && active !== i) {
                    e.preventDefault();
                    setActive(i);
                  }
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-[24%] sm:w-[22%] flex flex-col items-center gap-1 sm:gap-1.5 rounded-xl px-1 py-2 sm:py-3 text-center bg-white dark:bg-gray-950 border transition-all duration-300 motion-reduce:transition-none focus:outline-none ${on
                  ? 'border-brand shadow-[0_8px_24px_-10px_color-mix(in_srgb,var(--brand-color)_70%,transparent)] scale-105'
                  : 'border-[color:color-mix(in_srgb,var(--brand-color)_18%,transparent)]'}`}
                style={{ left: pct(points[i].x), top: pct(points[i].y) }}
              >
                <span className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition-colors ${on ? 'bg-brand text-white' : 'bg-[color:color-mix(in_srgb,var(--brand-color)_10%,transparent)] text-brand'}`}>
                  <s.icon className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px]" aria-hidden="true" />
                </span>
                <span className={`font-sora font-semibold text-[10px] sm:text-xs leading-tight ${on ? 'text-brand' : 'text-navy dark:text-white'}`}>
                  {s.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* One-line description of the highlighted product */}
        <p
          id="ecosystem-desc"
          aria-live="polite"
          className="relative min-h-[2.5rem] mt-3 sm:mt-4 px-2 font-jakarta text-sm text-center text-gray-600 dark:text-gray-300"
        >
          {active === null ? (
            <span className="text-gray-400 dark:text-gray-500">Hover or tap a product to see how it connects.</span>
          ) : (
            <>
              <strong className="font-sora text-brand">{SPOKES[active].label}:</strong> {SPOKES[active].desc}
            </>
          )}
        </p>
      </div>
    </section>
  );
}
