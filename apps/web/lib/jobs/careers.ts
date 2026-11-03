import { createHash } from 'node:crypto';
import { prisma } from '@udyaibase/database';
import type { JobBoardCareersWidget } from '@prisma/client';
import { getEmbedRedis, frameAncestorsFor, widgetStatus, type WidgetStatus } from '@/lib/embed/widgets';
import { validateAccentColor, validateAndNormalizeDomains } from '@/lib/embed/validation';
import { EMBED_FONTS } from '@/lib/embed/fonts';
import { isClaimVerified } from '@/lib/jobs/trust';
import { jobPostingSalary, publicListingWhere } from '@/lib/jobs/public';
import { publicQuestions } from '@/lib/jobs/composer';

/** What both the hosted careers page and the website widget show about a company. */
export interface CareersCompany {
  employerId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  tagline: string | null;
  headline: string | null;
  description: string | null;
  brandColor: string;
  verified: boolean;
  perks: string[];
}

export interface CareersJob {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  workType: string;
  employmentType: string;
  experienceBand: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  showSalary: boolean;
  hasEsops: boolean;
  skills: string[];
  shortDescription: string | null;
  description: string;
  publishedAt: string | null;
  expiresAt: string | null;
  applicationType: 'INTERNAL' | 'EXTERNAL';
  applicationUrl: string | null;
  screeningQuestions: { id: string; question: string; type: 'text' | 'yesno'; required: boolean }[];
}

export const DEFAULT_BRAND = '#111827';

const employerSelect = {
  id: true, slug: true, companyName: true, logoUrl: true, websiteUrl: true, description: true,
  tagline: true, careersHeadline: true, brandColor: true, perks: true, isActive: true, deactivatedAt: true, deletedAt: true,
  startupId: true, startupClaimMethod: true,
  Startup: { select: { name: true, logoUrl: true, websiteUrl: true, description: true } },
} as const;

type EmployerRow = NonNullable<Awaited<ReturnType<typeof findEmployer>>>;
function findEmployer(where: { id: string } | { slug: string }) {
  return prisma.jobBoardEmployer.findUnique({ where, select: employerSelect });
}

function toCompany(e: EmployerRow): CareersCompany {
  const verified = !!e.Startup && isClaimVerified(e);
  return {
    employerId: e.id,
    slug: e.slug,
    name: verified ? e.Startup!.name : e.companyName,
    logoUrl: (verified ? e.Startup!.logoUrl : null) ?? e.logoUrl,
    websiteUrl: e.websiteUrl ?? (verified ? e.Startup!.websiteUrl : null),
    tagline: e.tagline,
    headline: e.careersHeadline,
    description: e.description ?? (verified ? e.Startup!.description : null),
    brandColor: e.brandColor && /^#[0-9a-f]{6}$/i.test(e.brandColor) ? e.brandColor : DEFAULT_BRAND,
    verified,
    perks: e.perks,
  };
}

export async function getCareersCompany(where: { id: string } | { slug: string }): Promise<CareersCompany | null> {
  const e = await findEmployer(where);
  if (!e || !e.isActive || e.deactivatedAt || e.deletedAt) return null;
  return toCompany(e);
}

/** Open, unexpired jobs the employer chose to show on their careers page / widget. */
export async function getCareersJobs(employerId: string, departments: string[] = []): Promise<CareersJob[]> {
  const rows = await prisma.jobBoardListing.findMany({
    where: {
      ...publicListingWhere(),
      employerId,
      showOnCareers: true,
      ...(departments.length ? { department: { in: departments } } : {}),
    },
    orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
    take: 100,
    select: {
      id: true, slug: true, title: true, department: true, location: true, city: true, country: true, workType: true,
      employmentType: true, experienceBand: true, salaryMin: true, salaryMax: true, salaryCurrency: true, showSalary: true,
      hasEsops: true, skills: true, shortDescription: true, description: true, publishedAt: true, expiresAt: true,
      applicationType: true, applicationUrl: true, screeningQuestions: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    salaryMin: r.showSalary ? r.salaryMin : null,
    salaryMax: r.showSalary ? r.salaryMax : null,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    applicationType: r.applicationType,
    screeningQuestions: publicQuestions(r.screeningQuestions),
  }));
}

const EMPLOYMENT: Record<string, string> = { FULL_TIME: 'FULL_TIME', PART_TIME: 'PART_TIME', CONTRACT: 'CONTRACTOR', INTERNSHIP: 'INTERN', FREELANCE: 'CONTRACTOR' };

/** Google JobPosting markup. Only ever emitted for verified companies. */
export function careersJobPostings(company: CareersCompany, jobs: CareersJob[], siteUrl: string) {
  if (!company.verified) return [];
  return jobs.map((j) => ({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: j.title,
    description: j.description,
    datePosted: j.publishedAt ?? undefined,
    validThrough: j.expiresAt ?? undefined,
    employmentType: EMPLOYMENT[j.employmentType] ?? 'FULL_TIME',
    url: `${siteUrl}/jobs/${j.slug}`,
    hiringOrganization: {
      '@type': 'Organization',
      name: company.name,
      ...(company.websiteUrl ? { sameAs: company.websiteUrl } : {}),
      ...(company.logoUrl ? { logo: company.logoUrl } : {}),
    },
    ...(j.workType === 'REMOTE'
      ? { jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: j.country || 'India' } }
      : { jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: j.city ?? undefined, addressCountry: j.country || 'IN' } } }),
    ...(jobPostingSalary(j) ? { baseSalary: jobPostingSalary(j) } : {}),
  }));
}

// ── Website widget ────────────────────────────────────────────────

function careersWidgetId(employerId: string): string {
  const h = createHash('sha256').update(`udyaibase-careers-widget:${employerId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const careersCspKey = (id: string) => `embed:csp:jobs:${id}`;

export async function syncCareersCsp(w: Pick<JobBoardCareersWidget, 'id' | 'active' | 'allowedDomains'>) {
  const r = getEmbedRedis();
  if (!r) return;
  if (w.active) await r.set(careersCspKey(w.id), frameAncestorsFor(w)).catch(() => {});
  else await r.del(careersCspKey(w.id)).catch(() => {});
}

/** Each employer has one careers widget, created on first visit with a deterministic id (safe under races). */
export async function ensureCareersWidget(employerId: string): Promise<JobBoardCareersWidget> {
  const existing = await prisma.jobBoardCareersWidget.findFirst({ where: { employerId }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  const id = careersWidgetId(employerId);
  try {
    const w = await prisma.jobBoardCareersWidget.create({ data: { id, employerId, isDefault: true, name: 'Careers widget', heading: 'Open roles', accentColor: '#a50f15' } });
    await syncCareersCsp(w);
    return w;
  } catch (err) {
    const again = await prisma.jobBoardCareersWidget.findUnique({ where: { id } });
    if (again) return again;
    throw err;
  }
}

// ── Portal shape, stats and input validation ──────────────────────

export type JobsPortalWidget = Omit<
  JobBoardCareersWidget,
  'createdAt' | 'updatedAt' | 'setupStartedAt' | 'codeCopiedAt' | 'markedInstalledAt' | 'firstSeenAt' | 'lastSeenAt'
> & {
  createdAt: string;
  updatedAt: string;
  setupStartedAt: string | null;
  codeCopiedAt: string | null;
  markedInstalledAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  status: WidgetStatus;
};

export function toJobsPortalWidget(w: JobBoardCareersWidget): JobsPortalWidget {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    ...w,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    setupStartedAt: iso(w.setupStartedAt),
    codeCopiedAt: iso(w.codeCopiedAt),
    markedInstalledAt: iso(w.markedInstalledAt),
    firstSeenAt: iso(w.firstSeenAt),
    lastSeenAt: iso(w.lastSeenAt),
    status: widgetStatus(w),
  };
}

export const jobsViewsKey = (id: string, date: string) => `embed:views:jobs:${id}:${date}`;

/** Widget views (last 30 days) and applications that came through the widget. */
export async function getJobsWidgetStats(widgetId: string, days = 30): Promise<{ views: number; registrations: number }> {
  const r = getEmbedRedis();
  let views = 0;
  if (r) {
    const keys = Array.from({ length: days }, (_, i) => jobsViewsKey(widgetId, new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)));
    const vals = await r.mget<(number | null)[]>(...keys).catch(() => []);
    views = (vals ?? []).reduce<number>((n, v) => n + (Number(v) || 0), 0);
  }
  const registrations = await prisma.jobBoardApplication.count({ where: { widgetId, source: 'WIDGET' } });
  return { views, registrations };
}

export async function getJobsWidgetReferrers(widgetId: string, take = 6) {
  const rows = await prisma.jobBoardApplication.groupBy({
    by: ['referrerUrl'],
    where: { widgetId, source: 'WIDGET', referrerUrl: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { referrerUrl: 'desc' } },
    take,
  });
  return rows.map((r) => ({ url: r.referrerUrl!, count: r._count._all }));
}

export class JobsWidgetInputError extends Error {}

const ONE_OF: Record<string, readonly string[]> = {
  layout: ['auto', 'grid', 'list', 'compact'],
  darkMode: ['auto', 'light', 'dark'],
  cornerStyle: ['sharp', 'rounded', 'pill'],
  headingAlign: ['left', 'center'],
  headingSize: ['sm', 'md', 'lg'],
  textScale: ['sm', 'md', 'lg'],
  buttonSize: ['sm', 'md', 'lg'],
  buttonStyle: ['filled', 'outline', 'soft'],
  cardStyle: ['bordered', 'elevated', 'flat'],
  spacing: ['compact', 'comfortable', 'spacious'],
};
const BOOLS = ['showLogo', 'showDepartment', 'showSalary', 'showSkills', 'showPoweredBy', 'active'] as const;

/** Validates a partial update from the customize panel. Unknown keys are ignored. */
export function parseJobsWidgetInput(b: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [k, allowed] of Object.entries(ONE_OF)) {
    if (k in b) {
      if (!allowed.includes(String(b[k]))) throw new JobsWidgetInputError(`Invalid ${k}.`);
      data[k] = b[k];
    }
  }
  for (const k of BOOLS) if (typeof b[k] === 'boolean') data[k] = b[k];
  if ('heading' in b) data.heading = String(b.heading ?? '').slice(0, 80) || null;
  if ('subheading' in b) data.subheading = String(b.subheading ?? '').slice(0, 200) || null;
  if ('buttonText' in b) data.buttonText = String(b.buttonText ?? '').trim().slice(0, 24) || 'View role';
  if ('name' in b) data.name = String(b.name ?? '').trim().slice(0, 60) || 'Careers widget';
  if ('accentColor' in b) {
    if (!validateAccentColor(String(b.accentColor))) throw new JobsWidgetInputError('Use a 6-digit hex colour, such as #A50F15.');
    data.accentColor = String(b.accentColor).toLowerCase();
  }
  if ('fontFamily' in b) {
    if (!EMBED_FONTS.some((f) => f.id === b.fontFamily)) throw new JobsWidgetInputError('Unknown font.');
    data.fontFamily = b.fontFamily;
  }
  if ('maxJobs' in b) data.maxJobs = Math.max(1, Math.min(50, Math.floor(Number(b.maxJobs)) || 20));
  if ('departments' in b && Array.isArray(b.departments)) {
    data.departments = Array.from(new Set(b.departments.map((d) => String(d).trim().slice(0, 80)).filter(Boolean))).slice(0, 30);
  }
  if ('allowedDomains' in b && Array.isArray(b.allowedDomains)) {
    try {
      data.allowedDomains = Array.from(new Set(validateAndNormalizeDomains(b.allowedDomains.map(String)))).slice(0, 20);
    } catch (err) {
      throw new JobsWidgetInputError(err instanceof Error ? err.message : 'Invalid domain.');
    }
  }
  return data;
}
