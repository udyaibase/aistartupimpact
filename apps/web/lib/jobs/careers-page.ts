import { prisma } from '@udyaibase/database';
import type { CareersPageData, PageJob } from '@/components/careers/CareersPage';
import type { CareersCompany } from '@/lib/jobs/careers';
import { publicListingWhere } from '@/lib/jobs/public';
import { placeText, salaryText } from '@/lib/jobs/format';
import { EMPLOYMENT_TYPES } from '@/lib/jobs/composer';
import { effectivePlan } from '@/lib/employer/plans';

/** Paid plans may remove "Powered by Udyaibase" (it comes back if the plan lapses). */
export async function canHideBrandingFor(employerId: string): Promise<boolean> {
  const e = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { plan: true, planExpiresAt: true, planIsTrial: true } });
  return !!e && effectivePlan(e).customBranding;
}

/**
 * Open roles for CareersPage: those shown on the Udyaibase careers page, or (website widget) those ticked for the
 * website, limited to the widget's teams when it has any.
 */
export async function getCareersPageJobs(employerId: string, opts: { widget?: { departments: string[] } } = {}): Promise<PageJob[]> {
  const w = opts.widget;
  const rows = await prisma.jobBoardListing.findMany({
    where: {
      ...publicListingWhere(), employerId,
      ...(w ? { showOnCareers: true, ...(w.departments.length ? { department: { in: w.departments } } : {}) } : { showOnProfile: true }),
    },
    orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
    take: 100,
    select: {
      slug: true, title: true, department: true, workType: true, city: true, country: true, location: true, employmentType: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, showSalary: true,
    },
  });
  return rows.map((r) => {
    const type = EMPLOYMENT_TYPES.find((t) => t.value === r.employmentType)?.label;
    const salary = r.showSalary ? salaryText(r) : null;
    return {
      slug: r.slug,
      title: r.title,
      team: r.department,
      meta: [placeText(r), type && r.employmentType !== 'FULL_TIME' ? type : null, salary].filter(Boolean) as string[],
    };
  });
}

/** `canHideBranding`: the plan allows removing "Powered by Udyaibase" (then the company's own choice decides). */
export function careersPageData(c: CareersCompany, jobs: PageJob[], canHideBranding = false): CareersPageData {
  return {
    slug: c.slug, name: c.name, logoUrl: c.logoUrl, websiteUrl: c.websiteUrl, brandColor: c.brandColor,
    headline: c.headline ?? '', description: c.description ?? '', perks: c.perks, content: c.content, facts: c.facts,
    jobs, general: c.general ? { slug: c.general.slug } : null, applyForm: c.applyForm,
    showPoweredBy: !(canHideBranding && c.content.hideBranding),
  };
}
