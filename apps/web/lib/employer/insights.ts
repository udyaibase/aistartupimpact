import { prisma } from '@udyaibase/database';

/** Pipeline order for the funnel; REJECTED is not a stage reached. */
const RANK: Record<string, number> = { APPLIED: 0, REVIEWED: 0, SHORTLISTED: 1, INTERVIEW: 2, OFFER: 3, HIRED: 4 };
export const FUNNEL = ['Applied', 'Shortlisted', 'Interview', 'Offer', 'Hired'] as const;

export const SOURCE_LABEL: Record<string, string> = {
  JOBS_PAGE: 'Udyaibase AI Jobs', STARTUP_PROFILE: 'Startup profile', GOOGLE: 'Google', WIDGET: 'Your website',
  CAREERS_PAGE: 'Careers page', REFERRAL: 'Referral', DIRECT: 'Direct link', OTHER: 'Other',
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const dayKey = (d: Date) => new Date(d.getTime() + 5.5 * 36e5).toISOString().slice(0, 10); // IST day

/** Hiring insights for one workspace over the last `days` days (and the period before, for change). */
export async function loadInsights(employerId: string, days: number) {
  const now = Date.now();
  const since = new Date(now - days * 864e5);
  const prevSince = new Date(now - 2 * days * 864e5);
  const notErased = { NOT: { email: { endsWith: '@deleted.invalid' } } };

  const [apps, prevCount, jobs, waiting] = await Promise.all([
    prisma.jobBoardApplication.findMany({
      where: { Listing: { employerId }, appliedAt: { gte: since }, ...notErased },
      select: {
        id: true, listingId: true, status: true, source: true, appliedAt: true, firstResponseAt: true, withdrawnAt: true,
        Events: { select: { toStatus: true } },
      },
    }),
    prisma.jobBoardApplication.count({ where: { Listing: { employerId }, appliedAt: { gte: prevSince, lt: since }, ...notErased } }),
    prisma.jobBoardListing.findMany({
      where: { employerId, deletedAt: null, OR: [{ status: 'OPEN' }, { closedAt: { gte: since } }, { publishedAt: { gte: since } }] },
      select: { id: true, title: true, status: true, viewsCount: true, moderationHold: true, _count: { select: { Applications: { where: notErased } } } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    }),
    prisma.jobBoardApplication.count({
      where: { Listing: { employerId, status: 'OPEN' }, status: { in: ['APPLIED', 'REVIEWED'] }, withdrawnAt: null, appliedAt: { lt: new Date(now - 5 * 864e5) }, ...notErased },
    }),
  ]);

  // Responsiveness: hours from applying to the first stage change or email.
  const responseHours = apps.filter((a) => a.firstResponseAt).map((a) => (a.firstResponseAt!.getTime() - a.appliedAt.getTime()) / 36e5);
  const answerable = apps.filter((a) => now - a.appliedAt.getTime() > 2 * 864e5);
  const within2d = answerable.filter((a) => a.firstResponseAt && a.firstResponseAt.getTime() - a.appliedAt.getTime() <= 2 * 864e5).length;

  // Funnel: furthest stage each candidate reached (a later rejection doesn't undo reaching a stage).
  const reached = apps.map((a) => Math.max(RANK[a.status] ?? 0, ...a.Events.map((e) => RANK[e.toStatus] ?? 0)));
  const funnel = FUNNEL.map((label, i) => ({ label, count: reached.filter((r) => r >= i).length }));

  const bySource = Object.entries(apps.reduce<Record<string, number>>((m, a) => ({ ...m, [a.source]: (m[a.source] ?? 0) + 1 }), {}))
    .map(([key, count]) => ({ key, label: SOURCE_LABEL[key] ?? key, count }))
    .sort((a, b) => b.count - a.count);

  const daily: { day: string; count: number }[] = [];
  const perDay = apps.reduce<Record<string, number>>((m, a) => { const k = dayKey(a.appliedAt); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now - i * 864e5));
    daily.push({ day: k, count: perDay[k] ?? 0 });
  }

  const perJob = jobs.map((j) => {
    const mine = apps.filter((a) => a.listingId === j.id);
    const resp = mine.filter((a) => a.firstResponseAt).map((a) => (a.firstResponseAt!.getTime() - a.appliedAt.getTime()) / 36e5);
    return {
      id: j.id, title: j.title, status: j.moderationHold ? 'REVIEW' : j.status, views: j.viewsCount,
      total: j._count.Applications, inRange: mine.length,
      applyRate: j.viewsCount > 0 ? j._count.Applications / j.viewsCount : null,
      waiting: mine.filter((a) => (a.status === 'APPLIED' || a.status === 'REVIEWED') && !a.withdrawnAt).length,
      medianResponseHours: median(resp),
    };
  });

  return {
    days,
    applications: apps.length,
    previous: prevCount,
    hires: reached.filter((r) => r >= 4).length,
    medianResponseHours: median(responseHours),
    repliedWithin2Days: answerable.length ? within2d / answerable.length : null,
    waitingOver5Days: waiting,
    funnel,
    bySource,
    daily,
    perJob,
  };
}

export type Insights = Awaited<ReturnType<typeof loadInsights>>;
