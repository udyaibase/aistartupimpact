import Link from 'next/link';
import { prisma } from '@udyaibase/database';
import { INTENTS, REFERRAL_SOURCES, TOPICS, EXPERIENCE_LEVELS } from '@udyaibase/utils/personalization';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audience insights | Admin' };

const RANGES = { '30': 30, '90': 90, all: null } as const;
type RangeKey = keyof typeof RANGES;

/** What website users told us in onboarding: how they found us, why they're here, what they follow. Counts only. */
export default async function AudienceInsightsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: raw } = await searchParams;
  const range: RangeKey = raw === '90' || raw === 'all' ? raw : '30';
  const days = RANGES[range];
  const since = days ? new Date(Date.now() - days * 86_400_000) : new Date(0);

  const [totals, referrals, others, intents, topics, roles, exp, cities] = await Promise.all([
    prisma.$queryRaw<{ signups: number; answered: number; skipped: number }[]>`
      SELECT count(*)::int AS signups,
             count(*) FILTER (WHERE cardinality(intents) > 0)::int AS answered,
             count(*) FILTER (WHERE "onboardingCompleted" AND cardinality(intents) = 0)::int AS skipped
      FROM "WebUser" WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL`,
    prisma.$queryRaw<{ k: string; n: number }[]>`
      SELECT "referralSource" AS k, count(*)::int AS n FROM "WebUser"
      WHERE "createdAt" >= ${since} AND "referralSource" IS NOT NULL AND "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ k: string; n: number }[]>`
      SELECT lower(trim("referralDetail")) AS k, count(*)::int AS n FROM "WebUser"
      WHERE "createdAt" >= ${since} AND "referralSource" = 'other' AND "referralDetail" IS NOT NULL AND "deletedAt" IS NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
    prisma.$queryRaw<{ k: string; n: number }[]>`
      SELECT unnest(intents) AS k, count(*)::int AS n FROM "WebUser" WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ k: string; n: number }[]>`
      SELECT unnest(topics) AS k, count(*)::int AS n FROM "WebUser" WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ k: string; n: number }[]>`
      SELECT jsonb_array_elements_text("jobPrefs"->'roles') AS k, count(*)::int AS n FROM "WebUser"
      WHERE "createdAt" >= ${since} AND "jobPrefs" IS NOT NULL AND "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
    prisma.$queryRaw<{ k: string; n: number }[]>`
      SELECT "jobPrefs"->>'experience' AS k, count(*)::int AS n FROM "WebUser"
      WHERE "createdAt" >= ${since} AND "jobPrefs"->>'experience' IS NOT NULL AND "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ k: string; n: number }[]>`
      SELECT c.name AS k, count(*)::int AS n FROM "WebUser" w JOIN "City" c ON c.id = w."cityId"
      WHERE w."createdAt" >= ${since} AND w."deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
  ]);
  const t = totals[0] ?? { signups: 0, answered: 0, skipped: 0 };
  const label = (list: readonly { value?: string; id?: string; label: string }[]) => (k: string) => list.find((x) => (x.value ?? x.id) === k)?.label ?? k;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/web-users" className="text-sm text-gray-500 hover:underline">← Web users</Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Audience insights</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">What new website users told us during onboarding. Counts only, no names.</p>
        </div>
        <nav className="flex gap-1 rounded-lg border border-gray-200 dark:border-gray-800 p-1" aria-label="Time range">
          {(['30', '90', 'all'] as RangeKey[]).map((r) => (
            <Link key={r} href={`?range=${r}`} aria-current={r === range ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${r === range ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {r === 'all' ? 'All time' : `Last ${r} days`}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="New accounts" value={t.signups} />
        <Stat label="Answered onboarding" value={t.answered} sub={pct(t.answered, t.signups)} />
        <Stat label="Skipped onboarding" value={t.skipped} sub={pct(t.skipped, t.signups)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars title="How they heard about Udyaibase" rows={referrals} name={label(REFERRAL_SOURCES)} empty="No answers yet." />
        <Bars title="“Somewhere else”: their words" rows={others} name={(k) => k} empty="Nobody picked “Somewhere else” yet." />
        <Bars title="What they’re here for" rows={intents} name={label(INTENTS)} empty="No answers yet." note="Up to 3 each" />
        <Bars title="Topics they follow" rows={topics} name={label(TOPICS)} empty="No answers yet." />
        <Bars title="Job roles wanted" rows={roles} name={(k) => k.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())} empty="No job seekers yet." />
        <Bars title="Experience of job seekers" rows={exp} name={label(EXPERIENCE_LEVELS)} empty="No answers yet." />
        <Bars title="Cities" rows={cities} name={(k) => k} empty="No cities yet." />
      </div>
    </div>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}% of new accounts` : undefined);

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">{value.toLocaleString('en-IN')}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Bars({ title, rows, name, empty, note }: { title: string; rows: { k: string; n: number }[]; name: (k: string) => string; empty: string; note?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
        {note && <span className="text-xs text-gray-500">{note}</span>}
      </div>
      {rows.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.k} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-800 dark:text-gray-200 truncate">{name(r.k)}</span>
                <span className="shrink-0 tabular-nums text-gray-600 dark:text-gray-400">{r.n} · {Math.round((r.n / total) * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
                <div className="h-full rounded-full bg-gray-900 dark:bg-gray-200" style={{ width: `${(r.n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
