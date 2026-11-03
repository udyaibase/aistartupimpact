import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import {
  ensureCareersWidget, getCareersCompany, getCareersJobs, getJobsWidgetReferrers, getJobsWidgetStats, toJobsPortalWidget,
} from '@/lib/jobs/careers';
import { siteOrigin } from '@/lib/embed/platforms';
import JobsWidgetSetup from '@/components/employer/careers/JobsWidgetSetup';
import { effectivePlan } from '@/lib/employer/plans';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Website widget' };

export default async function EmployerCareersPage() {
  const session = await requirePagePermission('widget.manage');

  const [widget, company, teams, employer] = await Promise.all([
    ensureCareersWidget(session.id),
    getCareersCompany({ id: session.id }),
    prisma.jobBoardListing.findMany({
      where: { employerId: session.id, deletedAt: null, department: { not: null }, status: { in: ['OPEN', 'PAUSED', 'DRAFT'] } },
      distinct: ['department'],
      select: { department: true },
    }),
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { plan: true, planExpiresAt: true, planIsTrial: true } }),
  ]);
  if (!company) redirect('/employer/dashboard');

  const [jobs, stats, referrers] = await Promise.all([
    getCareersJobs(session.id),
    getJobsWidgetStats(widget.id),
    getJobsWidgetReferrers(widget.id),
  ]);

  return (
    <JobsWidgetSetup
      widget={toJobsPortalWidget(widget)}
      stats={stats}
      referrers={referrers}
      origin={siteOrigin()}
      openJobs={jobs.length}
      canHideBranding={!!employer && effectivePlan(employer).customBranding}
      departments={Array.from(new Set([...teams.map((t) => t.department!), ...widget.departments])).sort()}
    />
  );
}
