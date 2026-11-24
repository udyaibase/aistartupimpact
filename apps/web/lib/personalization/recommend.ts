/**
 * "For you": what a signed-in website user sees first, from what they told us (intents, topics, job preferences,
 * city) and what they've looked at recently. Ranked the same way on every visit (no shuffle) and every item carries
 * the reason it was picked, shown on the card.
 *
 * What they chose always counts more than what we infer from views.
 */
import { sql } from '@/lib/db';
import { cleanJobPrefs, EXPERIENCE_LEVELS, isIntent, topicById, topicForStartupCategory, topicForText, type IntentValue } from './topics';
import { JOB_CATEGORIES } from '@/lib/jobs/composer';

export type RecType = 'article' | 'tool' | 'startup' | 'job' | 'event';
export interface Rec { type: RecType; id: string; title: string; href: string; subtitle: string | null; imageUrl: string | null; reason: string; rating?: number | null }

const TOTAL = 12;
/** Which kind of item each reason for visiting asks for. */
const TYPE_FOR: Record<IntentValue, RecType> = {
  reading_news: 'article', learning_ai: 'article', exploring_tools: 'tool', looking_for_jobs: 'job',
  following_startups: 'startup', investor_vc: 'startup', founder_builder: 'startup', attending_events: 'event',
};
/** Without answers (skipped setup): a mix of everything. */
const DEFAULT_ORDER: RecType[] = ['article', 'tool', 'startup', 'job', 'event'];

/** How many cards each kind gets: the first reason the most, then the rest, then one of everything else. */
export function slotsFor(intents: IntentValue[]): Map<RecType, number> {
  const order = [...new Set(intents.map((i) => TYPE_FOR[i]))];
  const slots = new Map<RecType, number>();
  const shares = order.length === 1 ? [6] : order.length === 2 ? [5, 4] : [4, 3, 3];
  order.forEach((t, i) => slots.set(t, shares[i] ?? 2));
  for (const t of DEFAULT_ORDER) if (!slots.has(t)) slots.set(t, order.length ? 1 : 2);
  return slots;
}

const roleLabel = new Map(JOB_CATEGORIES.map((c) => [c.value as string, c.label as string]));

export async function recommendFor(userId: string): Promise<Rec[]> {
  const users = await sql`
    SELECT w.intents, w.topics, w."jobPrefs", w."primaryIntent", c.name AS "cityName"
    FROM "WebUser" w LEFT JOIN "City" c ON c.id = w."cityId"
    WHERE w.id = ${userId} LIMIT 1
  ` as unknown as { intents: string[] | null; topics: string[] | null; jobPrefs: unknown; primaryIntent: string | null; cityName: string | null }[];
  const u = users[0];
  if (!u) return [];
  const intents = ((u.intents?.length ? u.intents : u.primaryIntent ? [u.primaryIntent] : []).filter(isIntent)) as IntentValue[];
  const topics = (u.topics ?? []).filter((t) => topicById(t));
  const job = cleanJobPrefs(u.jobPrefs, JOB_CATEGORIES.map((c) => c.value as string));
  const city = u.cityName?.trim() || null;
  const slots = slotsFor(intents);

  const [interestRows, recent] = await Promise.all([
    sql`SELECT "categoryId" FROM "WebUserInterest" WHERE "userId" = ${userId}`.then((r) => r as unknown as { categoryId: string }[]),
    // What they opened in the last 30 days (newest first): not shown again, and tool categories they browse count.
    sql`
      SELECT "entityType", "entityId", MAX("categoryId") AS "categoryId"
      FROM "WebUserInteraction"
      WHERE "userId" = ${userId} AND action = 'view' AND "createdAt" > NOW() - INTERVAL '30 days'
      GROUP BY "entityType", "entityId" ORDER BY MAX("createdAt") DESC LIMIT 100
    `.then((r) => r as unknown as { entityType: string; entityId: string | null; categoryId: string | null }[]),
  ]);
  const seen = (type: string) => recent.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId!) ;
  const chosenToolCats = interestRows.map((r) => r.categoryId);
  const browsedToolCats = [...new Set(recent.filter((r) => r.entityType === 'tool' && r.categoryId).map((r) => r.categoryId!))];

  const wants = (t: RecType) => (slots.get(t) ?? 0) > 0;
  const [articles, tools, startups, jobs, events] = await Promise.all([
    wants('article') ? sql`
      SELECT a.id, a.title, a.slug, a.excerpt, a."coverImage", a.type
      FROM "Article" a
      -- News, our stories and founder stories (not opinions, reviews or sponsored posts).
      WHERE a.type IN ('NEWS', 'STORY', 'FOUNDER_STORY') AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        ${seen('article').length ? sql`AND a.id != ALL(${seen('article')}::text[])` : sql``}
      ORDER BY a."publishedAt" DESC NULLS LAST LIMIT 60
    `.then((r) => r as unknown as { id: string; title: string; slug: string; excerpt: string | null; coverImage: string | null; type: string }[]) : Promise.resolve([]),
    wants('tool') ? sql`
      SELECT t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", t."categoryId", c.name AS "categoryName"
      FROM "AiTool" t LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
      WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
        ${seen('tool').length ? sql`AND t.id != ALL(${seen('tool')}::text[])` : sql``}
      ORDER BY (t."categoryId" = ANY(${chosenToolCats}::text[])) DESC, (t."categoryId" = ANY(${browsedToolCats}::text[])) DESC,
               t."avgRating" DESC NULLS LAST, t."createdAt" DESC
      LIMIT 30
    `.then((r) => r as unknown as { id: string; name: string; slug: string; tagline: string | null; logoUrl: string | null; avgRating: number | null; categoryId: string | null; categoryName: string | null }[]) : Promise.resolve([]),
    wants('startup') ? sql`
      SELECT s.id, s.name, s.slug, s.tagline, s."logoUrl", s.category
      FROM "Startup" s
      WHERE s."isApproved" = true AND s."deletedAt" IS NULL
        ${seen('startup').length ? sql`AND s.id != ALL(${seen('startup')}::text[])` : sql``}
      ORDER BY s."createdAt" DESC LIMIT 80
    `.then((r) => r as unknown as { id: string; name: string; slug: string; tagline: string | null; logoUrl: string | null; category: string | null }[]) : Promise.resolve([]),
    wants('job') ? sql`
      SELECT jl.id, jl.title, jl.slug, jl.category, jl.city, jl."workType", jl."experienceMin", jl."experienceMax", e."companyName" AS "company", e."logoUrl"
      FROM "JobBoardListing" jl JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      WHERE jl.status = 'OPEN' AND jl."deletedAt" IS NULL AND jl."moderationHold" = false AND jl."showOnJobsPage" = true
        AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW())
      ORDER BY jl."createdAt" DESC LIMIT 100
    `.then((r) => r as unknown as { id: string; title: string; slug: string; category: string; city: string | null; workType: string; experienceMin: number | null; experienceMax: number | null; company: string; logoUrl: string | null }[]) : Promise.resolve([]),
    wants('event') ? sql`
      SELECT e.id, e.title, e.slug, e.format, e.address, e."startAt", e."coverImageUrl"
      FROM "Event" e
      WHERE e.status = 'PUBLISHED' AND e."deletedAt" IS NULL AND e.visibility = 'PUBLIC' AND e."startAt" >= NOW()
      ORDER BY e."startAt" ASC LIMIT 40
    `.then((r) => r as unknown as { id: string; title: string; slug: string; format: string; address: string | null; startAt: Date; coverImageUrl: string | null }[]) : Promise.resolve([]),
  ]);

  // Each list: matches first (by their own order), then the rest. Reasons say why.
  const byScore = <T,>(rows: T[], score: (r: T) => number) => rows.map((r, i) => ({ r, s: score(r), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);

  const articleRecs: Rec[] = byScore(articles, (a) => (topicForText(`${a.title} ${a.excerpt ?? ''}`, topics) ? 1 : 0)).map((a) => {
    const t = topicForText(`${a.title} ${a.excerpt ?? ''}`, topics);
    return { type: 'article', id: a.id, title: a.title, href: a.type === 'NEWS' ? `/news/${a.slug}` : `/stories/${a.slug}`, subtitle: a.excerpt, imageUrl: a.coverImage, reason: t ? `Because you follow ${t.label}` : 'Latest in Indian AI' };
  });

  const toolRecs: Rec[] = tools.map((t) => {
    const followed = topics.map(topicById).find((tp) => tp && t.categoryName && tp.tools.includes(t.categoryName));
    const reason = followed ? `Because you follow ${followed.label}`
      : t.categoryId && chosenToolCats.includes(t.categoryId) ? `For ${t.categoryName ?? 'your interests'}`
      : t.categoryId && browsedToolCats.includes(t.categoryId) ? `Like ${t.categoryName ?? 'tools'} you’ve viewed`
      : 'Highly rated';
    return { type: 'tool', id: t.id, title: t.name, href: `/tools/${t.slug}`, subtitle: t.tagline, imageUrl: t.logoUrl, reason, rating: t.avgRating };
  });

  const startupRecs: Rec[] = byScore(startups, (s) => (topicForStartupCategory(s.category, topics) ? 1 : 0)).map((s) => {
    const t = topicForStartupCategory(s.category, topics);
    return { type: 'startup', id: s.id, title: s.name, href: `/startups/${s.slug}`, subtitle: s.tagline, imageUrl: s.logoUrl, reason: t ? `${t.label} startup` : 'Recently added' };
  });

  const exp = EXPERIENCE_LEVELS.find((e) => e.value === job.experience);
  const cityLc = city?.toLowerCase() ?? null;
  const jobScore = (j: (typeof jobs)[number]) => {
    let s = 0;
    if (job.roles.includes(j.category)) s += 4;
    if (job.workModes.length && job.workModes.includes(j.workType)) s += 1;
    if (cityLc && j.city?.toLowerCase().includes(cityLc)) s += 2;
    else if (j.workType === 'REMOTE') s += 1;
    if (exp && (j.experienceMin ?? 0) <= exp.max && (j.experienceMax ?? 99) >= exp.min) s += 1;
    return s;
  };
  // Ranked, never hidden: a job outside their preferences can still be the right one.
  const jobRecs: Rec[] = byScore(jobs, jobScore).map((j) => {
    const reason = job.roles.includes(j.category) ? `Matches ${roleLabel.get(j.category) ?? 'your role'}`
      : cityLc && j.city?.toLowerCase().includes(cityLc) ? `In ${city}`
      : j.workType === 'REMOTE' ? 'Remote' : 'New job';
    return { type: 'job', id: j.id, title: j.title, href: `/jobs/${j.slug}`, subtitle: j.company, imageUrl: j.logoUrl, reason };
  });

  const eventRecs: Rec[] = byScore(events, (e) => (cityLc && e.address?.toLowerCase().includes(cityLc) ? 2 : e.format === 'VIRTUAL' ? 1 : 0)).map((e) => {
    const near = cityLc && e.address?.toLowerCase().includes(cityLc);
    const when = new Date(e.startAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    return { type: 'event', id: e.id, title: e.title, href: `/events/${e.slug}`, subtitle: when, imageUrl: e.coverImageUrl, reason: near ? `Near you in ${city}` : e.format === 'VIRTUAL' ? 'Online' : 'Upcoming' };
  });

  const lists: Record<RecType, Rec[]> = { article: articleRecs, tool: toolRecs, startup: startupRecs, job: jobRecs, event: eventRecs };
  // Fill each kind's slots in the order of what they're here for; spare slots go to whatever still has items.
  const order = [...slots.keys()];
  const take = new Map(order.map((t) => [t, Math.min(slots.get(t)!, lists[t].length)]));
  let spare = TOTAL - [...take.values()].reduce((a, b) => a + b, 0);
  for (const t of order) {
    if (spare <= 0) break;
    const extra = Math.min(spare, lists[t].length - take.get(t)!);
    take.set(t, take.get(t)! + extra);
    spare -= extra;
  }
  // Mixed, not grouped: one of each kind in turn, most wanted kind first.
  const picked: Rec[] = [];
  for (let round = 0; picked.length < TOTAL; round++) {
    let added = false;
    for (const t of order) if (round < take.get(t)!) { picked.push(lists[t][round]); added = true; }
    if (!added) break;
  }
  return picked.slice(0, TOTAL);
}
