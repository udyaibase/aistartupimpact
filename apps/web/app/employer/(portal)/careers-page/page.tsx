import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { careersSettingsOf, getCareersCompany } from '@/lib/jobs/careers';
import { canHideBrandingFor, careersPageData, getCareersPageJobs } from '@/lib/jobs/careers-page';
import CareersPageEditor from '@/components/employer/careers/CareersPageEditor';
import CareersSubscribersCard from '@/components/employer/careers/CareersSubscribersCard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Careers page' };

export default async function EmployerCareersPageEditor() {
  const session = await requirePagePermission('company.manage');
  const company = await getCareersCompany({ id: session.id });
  if (!company) redirect('/employer/dashboard');
  const [jobs, canHide, saved] = await Promise.all([
    getCareersPageJobs(company.employerId),
    canHideBrandingFor(company.employerId),
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { careersContent: true } }),
  ]);

  return (
    <>
      <CareersPageEditor
        initial={careersSettingsOf(company)}
        page={careersPageData(company, jobs, canHide)}
        pageUrl={`/jobs/company/${company.slug}`}
        isNew={!saved?.careersContent}
        canHideBranding={canHide}
      />
      <CareersSubscribersCard employerId={session.id} />
    </>
  );
}
