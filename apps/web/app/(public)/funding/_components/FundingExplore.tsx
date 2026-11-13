import Link from 'next/link';
import { moneyLabel, monthTitle, type Group } from '@/lib/funding/insights';

/** Internal links from a funding page to its hub pages: cities, monthly reports and investors. */
export default function FundingExplore({ cities, months, investors }: {
  cities: Group[]; months: { slug: string; year: number; month: number; deals: number }[]; investors: Group[];
}) {
  const col = (title: string, items: { href: string; label: string; meta: string }[]) => items.length ? (
    <div>
      <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.href} className="flex items-baseline justify-between gap-3 text-sm font-jakarta">
            <Link href={it.href} className="text-gray-700 dark:text-gray-300 hover:text-brand truncate">{it.label}</Link>
            <span className="text-xs text-gray-400 shrink-0">{it.meta}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  return (
    <section aria-labelledby="explore-heading" className="card p-4 sm:p-6">
      <h2 id="explore-heading" className="font-sora font-bold text-base sm:text-xl text-navy dark:text-white mb-4">Explore AI startup funding in India</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {col('By city', cities.map((c) => ({ href: `/funding/india/${c.slug}`, label: `AI funding in ${c.name}`, meta: `${c.deals} rounds · ${moneyLabel(c.paise, c.cents).split(' (')[0]}` })))}
        {col('Monthly reports', months.map((m) => ({ href: `/funding/india/${m.slug}`, label: `${monthTitle(m.year, m.month)}`, meta: `${m.deals} rounds` })))}
        {col('Top investors', investors.map((i) => ({ href: `/funding/investors/${i.slug}`, label: i.name, meta: `${i.deals} deals` })))}
      </div>
    </section>
  );
}
