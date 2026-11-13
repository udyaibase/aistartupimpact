import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { inrPaiseOf, moneyLabel, type FundingRoundRow, roundMoneyLabel } from '@/lib/funding/insights';
import { roundLabel } from '@/lib/funding/format';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/**
 * Server-rendered list of rounds: crawlable links to each round's page (or the startup when the round has no
 * page yet). Startup, round, amount, city and date are public; investors and filters stay in the gated tracker.
 */
export default function FundingRoundList({ id, title, rounds, intro }: { id: string; title: string; rounds: FundingRoundRow[]; intro?: string }) {
  if (!rounds.length) return null;
  return (
    <section aria-labelledby={id} className="card p-4 sm:p-6">
      <h2 id={id} className="font-sora font-bold text-base sm:text-xl text-navy dark:text-white">{title}</h2>
      {intro && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 font-jakarta">{intro}</p>}
      <ol className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
        {rounds.map((r) => {
          const href = r.slug ? `/funding/${r.slug}` : `/startups/${r.startupSlug}`;
          const amount = Number(r.amountInr ?? 0) > 0 || Number(r.amountUsd ?? 0) > 0 ? roundMoneyLabel(r) : 'Undisclosed';
          return (
            <li key={r.id} className="py-3 flex items-center gap-3 font-jakarta">
              {r.startupLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
                <img src={r.startupLogoUrl} alt={`${r.startupName.trim()} logo`} width={36} height={36} loading="lazy" className="w-9 h-9 rounded-lg object-contain bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shrink-0" />
              ) : (
                <span aria-hidden className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-sora font-bold text-brand shrink-0">{r.startupName.trim().charAt(0)}</span>
              )}
              <div className="min-w-0 flex-1">
                <Link href={href} className="font-sora font-bold text-sm text-navy dark:text-white hover:text-brand">
                  {r.startupName.trim()} raises {amount === 'Undisclosed' ? '' : `${amount} `}{roundLabel(r.roundType)}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
                  {r.city && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" aria-hidden />{r.city}</span>}
                  {r.startupCategory && <span>· {r.startupCategory}</span>}
                </div>
              </div>
              <time dateTime={r.announcedAt.slice(0, 10)} className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{shortDate(r.announcedAt)}</time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
