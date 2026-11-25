import { createHash } from 'node:crypto';
import { prisma } from '@udyaibase/database';
import type { JobBoardCareersWidget } from '@prisma/client';
import { getEmbedRedis, frameAncestorsFor, widgetStatus, type WidgetStatus } from '@/lib/embed/widgets';
import { validateAccentColor, validateAndNormalizeDomains } from '@/lib/embed/validation';
import { EMBED_FONTS } from '@/lib/embed/fonts';
import { isClaimVerified } from '@/lib/jobs/trust';
import { jobPostingSalary, publicListingWhere } from '@/lib/jobs/public';
import { publicQuestions } from '@/lib/jobs/composer';
import { parseApplyFormConfig, type ApplyFormConfig } from '@/lib/jobs/apply-form';
import { parseWidgetDesign, type WidgetDesign } from '@/lib/jobs/widget-design';
import { LIMITS, parseCareersContent, plain, type CareersContent } from '@/lib/jobs/careers-content';
import { cleanPerks } from '@/lib/jobs/perks';

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
  applyForm: ApplyFormConfig;
  /** "Life at {company}" sections (lib/jobs/careers-content.ts). */
  content: CareersContent;
  /** Short facts for the careers page (city, team size, stage, founded), each already formatted. */
  facts: { label: string; value: string }[];
  /** The hidden listing behind "Apply generally" (shown when no roles are open), or null when it's turned off. */
  general: { slug: string; title: string } | null;
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
  experienceMin: number | null;
  experienceMax: number | null;
  category: string;
  categoryLabel: string | null;
  visaSponsorship: boolean;
  hiringManagerName: string | null;
  /** Openings for this role (1 = a single hire). */
  positions: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  /** 'monthly' for an internship stipend, otherwise 'yearly'. */
  salaryPeriod?: string;
  showSalary: boolean;
  hasEsops: boolean;
  skills: string[];
  shortDescription: string | null;
  description: string;
  publishedAt: string | null;
  expiresAt: string | null;
  applicationType: 'INTERNAL' | 'EXTERNAL';
  applicationUrl: string | null;
  screeningQuestions: { id: string; question: string; type: 'text' | 'yesno' | 'choice' | 'number'; required: boolean; options?: string[] }[];
}

export const DEFAULT_BRAND = '#111827';

const employerSelect = {
  id: true, slug: true, companyName: true, logoUrl: true, websiteUrl: true, description: true,
  tagline: true, careersHeadline: true, brandColor: true, perks: true, applyFormConfig: true, careersContent: true, location: true, companySize: true, teamSize: true, stage: true, industry: true, acceptGeneralApplications: true, isActive: true, deactivatedAt: true, deletedAt: true,
  startupId: true, startupClaimMethod: true,
  Startup: { select: { name: true, logoUrl: true, websiteUrl: true, description: true, foundedYear: true, headquartersCity: true } },
  Listings: { where: { isGeneral: true, deletedAt: null }, select: { slug: true, title: true }, take: 1 },
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
    applyForm: parseApplyFormConfig(e.applyFormConfig),
    content: parseCareersContent(e.careersContent),
    general: e.acceptGeneralApplications ? e.Listings[0] ?? null : null,
    facts: factsOf(e, verified),
  };
}

const STAGE_LABEL: Record<string, string> = {
  IDEA: 'Idea', PRE_SEED: 'Pre-seed', SEED: 'Seed', SERIES_A: 'Series A', SERIES_B: 'Series B', SERIES_C: 'Series C',
  SERIES_D: 'Series D', GROWTH: 'Growth', LATE_STAGE: 'Late stage', IPO: 'Public', PUBLIC: 'Public', BOOTSTRAPPED: 'Bootstrapped',
};

function factsOf(e: EmployerRow, verified: boolean): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const city = (e.location || (verified ? e.Startup?.headquartersCity : null) || '').split(',')[0].trim();
  if (city) out.push({ label: 'Based in', value: city });
  const size = (e.teamSize || e.companySize || '').trim();
  if (size) out.push({ label: 'Team', value: /people|employees/i.test(size) ? size : `${size} people` });
  if (e.stage) out.push({ label: 'Stage', value: STAGE_LABEL[e.stage] ?? e.stage.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) });
  if (verified && e.Startup?.foundedYear) out.push({ label: 'Founded', value: String(e.Startup.foundedYear) });
  if (e.industry) out.push({ label: 'Industry', value: e.industry });
  return out.slice(0, 4);
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
      employmentType: true, experienceBand: true, experienceMin: true, experienceMax: true, category: true, categoryLabel: true,
      visaSponsorship: true, hiringManagerName: true, positions: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true, showSalary: true,
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
    ...(j.positions > 1 ? { totalJobOpenings: j.positions } : {}),
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

// ── Company page content (edited in the widget's Customize panel) ────────

export interface CareersSettings {
  content: CareersContent;
  /** The Intro section edits the company's careers headline and description. */
  headline: string;
  description: string;
  /** The Perks section edits the company perks list (also shown on every job). */
  perks: string[];
  acceptGeneral: boolean;
  generalSlug: string | null;
  /** Hex like #A50F15; colours the careers page hero and accents. */
  brandColor: string;
}

export function careersSettingsOf(company?: CareersCompany | null): CareersSettings {
  return {
    content: company?.content ?? parseCareersContent(null),
    headline: company?.headline ?? '',
    description: company?.description ?? '',
    perks: company?.perks ?? [],
    acceptGeneral: !!company?.general,
    generalSlug: company?.general?.slug ?? null,
    brandColor: company?.brandColor ?? DEFAULT_BRAND,
  };
}

/** Validated database update for a `careers` patch from the Customize panel. */
export function parseCareersSettingsInput(raw: unknown) {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if ('content' in r) data.careersContent = parseCareersContent(r.content);
  if ('headline' in r) data.careersHeadline = plain(r.headline, LIMITS.headline) || null;
  if ('description' in r) data.description = plain(r.description, LIMITS.description, true) || null;
  if ('perks' in r) data.perks = cleanPerks(r.perks);
  if (typeof r.acceptGeneral === 'boolean') data.acceptGeneralApplications = r.acceptGeneral;
  if ('brandColor' in r) {
    if (typeof r.brandColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(r.brandColor)) throw new JobsWidgetInputError('Use a 6-digit hex colour, such as #A50F15.');
    data.brandColor = r.brandColor.toLowerCase();
  }
  return data;
}

// ── General applications ────────

export const GENERAL_TITLE = 'General application';

/**
 * The workspace's hidden "General application" listing, created on first use. It is never public (closed, hidden from
 * the job board and portal job list); applications to it go into the normal pipeline. Returns its id.
 */
export async function ensureGeneralListing(employerId: string): Promise<string> {
  const existing = await prisma.jobBoardListing.findFirst({ where: { employerId, isGeneral: true, deletedAt: null }, select: { id: true } });
  if (existing) return existing.id;
  const e = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { slug: true, companyName: true } });
  if (!e) throw new Error('Workspace not found');
  const created = await prisma.jobBoardListing.create({
    data: {
      employerId,
      isGeneral: true,
      slug: `${e.slug}-general-application-${createHash('sha256').update(employerId).digest('hex').slice(0, 6)}`,
      title: GENERAL_TITLE,
      description: `Candidates interested in future roles at ${e.companyName}. Applications arrive here while no roles are open.`,
      status: 'CLOSED',
      showOnProfile: false,
      showOnCareers: false,
      applicationType: 'INTERNAL',
    },
    select: { id: true },
  });
  return created.id;
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
  'createdAt' | 'updatedAt' | 'setupStartedAt' | 'codeCopiedAt' | 'markedInstalledAt' | 'firstSeenAt' | 'lastSeenAt' | 'design'
> & {
  design: WidgetDesign;
  /** Saved on the workspace (it applies wherever candidates apply), edited in the same panel. */
  applyForm: ApplyFormConfig;
  createdAt: string;
  updatedAt: string;
  setupStartedAt: string | null;
  codeCopiedAt: string | null;
  markedInstalledAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  status: WidgetStatus;
};

export function toJobsPortalWidget(w: JobBoardCareersWidget, company?: CareersCompany | null): JobsPortalWidget {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    ...w,
    design: parseWidgetDesign(w.design),
    applyForm: company?.applyForm ?? parseApplyFormConfig(null),
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
  if ('design' in b) data.design = parseWidgetDesign(b.design);
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
