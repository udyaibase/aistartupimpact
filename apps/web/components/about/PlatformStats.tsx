import Link from 'next/link';

export type PlatformStat = { value: string; label: string; href?: string };

/** Always-dark stats band with a brand glow; numbers link to their directories. */
export default function PlatformStats({ stats }: { stats: PlatformStat[] }) {
  return (
    <section aria-label="Platform statistics" className="relative overflow-hidden rounded-3xl bg-gray-950 border border-white/10">
      <div
        className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        aria-hidden="true"
      />
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-[70%] h-48 rounded-full blur-3xl bg-[color:color-mix(in_srgb,var(--brand-color)_35%,transparent)]"
        aria-hidden="true"
      />
      <div className="relative grid grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => {
          const inner = (
            <>
              <div className="font-sora font-extrabold tracking-tight text-3xl sm:text-5xl text-brand">{s.value}</div>
              <div className="mt-2 font-jakarta text-xs sm:text-sm font-medium uppercase tracking-[0.12em] text-gray-400">{s.label}</div>
            </>
          );
          // Hairline dividers: between columns, and between the two rows on small screens.
          const cls = `group px-4 py-8 sm:py-12 text-center transition-colors hover:bg-white/[0.03] border-white/10 ${i % 2 === 0 ? 'border-r' : 'lg:border-r'} ${i === stats.length - 1 ? 'lg:border-r-0' : ''} ${i < 2 ? 'border-b lg:border-b-0' : ''}`;
          return s.href ? (
            <Link
              key={s.label}
              href={s.href}
              {...(s.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={cls}
            >
              {inner}
            </Link>
          ) : (
            <div key={s.label} className={cls}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}
