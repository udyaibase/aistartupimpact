import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { jsonLd } from '@/lib/json-ld';
import { getFundingRounds } from '@/lib/funding/rounds';
import { byCity, byInvestor, bySector, byStage, HUB_MIN_ROUNDS, inScope, inrPaiseOf, moneyLabel, monthTitle, newestFirst, parseMonthSlug, roundsInCity, roundsInMonth, summarize, type FundingRoundRow, type Group, roundMoneyLabel } from '@/lib/funding/insights';
import { roundLabel } from '@/lib/funding/format';
import { fitTitle, metaSnippet } from '@/lib/seo-text';
import { breadcrumbSchema, datasetSchema, roundsItemListSchema } from '@/lib/funding/schema';
import FundingRoundList from '../../_components/FundingRoundList';

/**
 * /funding/india/<month>-<year> — monthly report ("AI startup funding India November 2026")
 * /funding/india/<city>         — city hub ("AI startup funding Bengaluru")
 * Both built from the same India round list as the tracker. One route because two sibling dynamic folders aren't
 * allowed; the slug says which (a month slug can't clash with a city).
 */
export const revalidate = 3600;
export async function generateStaticParams() { return []; }

type Hub =
  | { kind: 'month'; slug: string; year: number; month: number; label: string; rounds: FundingRoundRow[]; previous: FundingRoundRow[] }
  | { kind: 'city'; slug: string; label: string; rounds: FundingRoundRow[] };

async function loadHub(slug: string): Promise<Hub | null> {
  const india = inScope(await getFundingRounds(), 'india');
  const m = parseMonthSlug(slug);
  if (m) {
    const rounds = roundsInMonth(india, m.year, m.month);
    if (!rounds.length) return null;
    const prev = m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 };
    return { kind: 'month', slug, ...m, label: monthTitle(m.year, m.month), rounds: newestFirst(rounds), previous: roundsInMonth(india, prev.year, prev.month) };
  }
  const rounds = roundsInCity(india, slug);
  if (!rounds.length) return null;
  return { kind: 'city', slug, label: rounds[0].city!, rounds: newestFirst(rounds) };
}

const total = (rs: FundingRoundRow[]) => rs.reduce((n, r) => n + inrPaiseOf(r), 0);
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const names = (gs: Group[], n = 3, withDeals = true) => list(gs.slice(0, n).map((g) => (withDeals ? `${g.name} (${g.deals})` : g.name)));

function overview(h: Hub): string {
  const s = summarize(h.rounds);
  const largest = s.largest;
  const parts: string[] = [];
  if (h.kind === 'month') {
    const before = total(h.previous);
    const change = before > 0 ? Math.round(((s.paise - before) / before) * 100) : null;
    parts.push(`In ${h.label}, Indian AI startups raised ${moneyLabel(s.paise, s.cents)} across ${s.deals} funding round${s.deals === 1 ? '' : 's'}${change != null ? `, ${change === 0 ? 'in line with' : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% on`} the previous month (${moneyLabel(before)} across ${h.previous.length})` : ''}.`);
  } else {
    parts.push(`AI startups headquartered in ${h.label} have raised ${moneyLabel(s.paise, s.cents)} across ${s.deals} funding round${s.deals === 1 ? '' : 's'} tracked by Udyaibase.`);
    if (s.ytd.deals) parts.push(`${s.ytd.deals} of those rounds (${moneyLabel(s.ytd.paise, s.ytd.cents)}) came in ${s.year}.`);
  }
  if (largest) parts.push(`The largest was ${largest.startupName.trim()}'s ${roundMoneyLabel(largest)} ${roundLabel(largest.roundType)}.`);
  const stages = byStage(h.rounds);
  if (stages.length) parts.push(`By stage, ${names(stages, 3)} rounds led the count.`);
  const inv = byInvestor(h.rounds);
  if (inv.length && inv[0].deals > 1) parts.push(`The most active investors were ${names(inv, 3)}.`);
  if (h.kind === 'month') {
    const cities = byCity(h.rounds);
    if (cities.length) parts.push(`${names(cities, 3, false)} led by number of deals.`);
  }
  return parts.join(' ');
}

const heading = (h: Hub) => (h.kind === 'month' ? `AI Startup Funding in India — ${h.label}` : `AI Startup Funding in ${h.label}`);

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const h = await loadHub(slug);
  if (!h) return { title: 'Not Found', robots: { index: false } };
  const s = summarize(h.rounds);
  const title = h.kind === 'month'
    ? fitTitle([`AI Startup Funding India ${h.label}: ${s.deals} Deals, ${moneyLabel(s.paise, s.cents).split(' (')[0]}`, `AI Startup Funding India — ${h.label}`])
    : fitTitle([`AI Startup Funding in ${h.label} (${s.year}): Deals & Investors`, `AI Startup Funding in ${h.label}`]);
  const url = `https://udyaibase.com/funding/india/${slug}`;
  const thin = h.rounds.length < (h.kind === 'month' ? HUB_MIN_ROUNDS.month : HUB_MIN_ROUNDS.city);
  return {
    title,
    description: metaSnippet(overview(h)),
    alternates: { canonical: url },
    robots: thin ? { index: false, follow: true } : undefined,
    openGraph: { title, url, type: 'article', images: [{ url: 'https://udyaibase.com/og-image.webp', width: 2250, height: 1181 }] },
  };
}

export default async function FundingHubPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const h = await loadHub(slug);
  if (!h) notFound();

  const url = `https://udyaibase.com/funding/india/${slug}`;
  const title = heading(h);
  const text = overview(h);
  const investors = byInvestor(h.rounds).slice(0, 10);
  const sectors = bySector(h.rounds).slice(0, 8);
  const stages = byStage(h.rounds).slice(0, 8);
  const cities = h.kind === 'month' ? byCity(h.rounds).slice(0, 8) : [];

  // Neighbouring monthly reports for month pages; other city hubs for city pages.
  const india = inScope(await getFundingRounds(), 'india');
  const neighbours = h.kind === 'month'
    ? [h.month === 0 ? { year: h.year - 1, month: 11 } : { year: h.year, month: h.month - 1 }, h.month === 11 ? { year: h.year + 1, month: 0 } : { year: h.year, month: h.month + 1 }]
        .map((m) => ({ ...m, n: roundsInMonth(india, m.year, m.month).length }))
        .filter((m) => m.n > 0)
        .map((m) => ({ href: `/funding/india/${monthTitle(m.year, m.month).toLowerCase().replace(' ', '-')}`, label: `${monthTitle(m.year, m.month)} (${m.n} rounds)` }))
    : byCity(india).filter((c) => c.slug !== slug && c.deals >= HUB_MIN_ROUNDS.city).slice(0, 8).map((c) => ({ href: `/funding/india/${c.slug}`, label: `${c.name} (${c.deals})` }));

  const schemas = [
    datasetSchema({
      name: `${title} — Udyaibase`,
      description: text,
      url,
      dateModified: h.rounds[0]?.announcedAt ?? null,
      keywords: h.kind === 'month'
        ? ['AI startup funding India', `AI funding ${h.label}`, 'Indian AI startups', 'venture capital India']
        : [`AI startup funding ${h.label}`, `${h.label} AI startups`, 'AI startup funding India'],
      spatial: h.kind === 'city' ? `${h.label}, India` : 'India',
    }),
    roundsItemListSchema(title, url, h.rounds.slice(0, 50)),
    breadcrumbSchema([
      { name: 'Home', url: 'https://udyaibase.com' },
      { name: 'AI Startup Funding India', url: 'https://udyaibase.com/funding' },
      { name: h.kind === 'month' ? h.label : h.label, url },
    ]),
  ];

  const groupList = (heading: string, gs: Group[], link?: (g: Group) => string) => gs.length ? (
    <div>
      <h2 className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white mb-2">{heading}</h2>
      <ul className="space-y-1.5 text-sm font-jakarta">
        {gs.map((g) => (
          <li key={g.slug} className="flex items-baseline justify-between gap-3">
            {link ? <Link href={link(g)} className="text-gray-700 dark:text-gray-300 hover:text-brand truncate">{g.name}</Link> : <span className="text-gray-700 dark:text-gray-300 truncate">{g.name}</span>}
            <span className="text-xs text-gray-400 shrink-0">{g.deals} · {moneyLabel(g.paise, g.cents).split(' (')[0]}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {schemas.map((s, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />)}

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <Link href="/funding" className="hover:text-brand">AI Startup Funding India</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <span className="text-gray-600 dark:text-gray-300">{h.label}</span>
      </nav>

      <header>
        <h1 className="font-sora font-extrabold text-2xl sm:text-4xl text-navy dark:text-white tracking-tight">{title}</h1>
        <p className="mt-3 text-sm sm:text-lg text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed max-w-3xl">{text}</p>
      </header>

      <FundingRoundList
        id="rounds"
        title={h.kind === 'month' ? `AI funding rounds in India, ${h.label}` : `AI funding rounds in ${h.label}`}
        rounds={h.rounds.slice(0, 50)}
        intro={h.rounds.length > 50 ? `The 50 most recent of ${h.rounds.length} rounds. See them all on the funding tracker.` : undefined}
      />

      <section className="card p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6" aria-label="Breakdown">
        {groupList(h.kind === 'month' ? `Most active investors, ${h.label}` : `Top investors in ${h.label} AI startups`, investors, (g) => `/funding/investors/${g.slug}`)}
        {h.kind === 'month' ? groupList('By city', cities, (g) => `/funding/india/${g.slug}`) : groupList('By sector', sectors)}
        {groupList('By stage', stages)}
      </section>

      {neighbours.length > 0 && (
        <nav aria-label={h.kind === 'month' ? 'Other monthly reports' : 'Other cities'} className="flex flex-wrap gap-2">
          {neighbours.map((n) => (
            <Link key={n.href} href={n.href} className="px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-800 text-sm font-jakarta text-gray-700 dark:text-gray-300 hover:border-brand hover:text-brand">
              {h.kind === 'month' ? n.label : `AI funding in ${n.label}`}
            </Link>
          ))}
          <Link href="/funding" className="px-3 py-1.5 rounded-full bg-brand text-white text-sm font-semibold font-jakarta">All AI funding in India →</Link>
        </nav>
      )}
    </div>
  );
}
