'use client';

import ReportButton from '@/components/shared/ReportButton';
import { JOB_REPORT_REASONS } from '@/lib/jobs/report-reasons';

/** "Report this job" link and dialog on the public job page. */
export default function ReportJobButton({ slug, title }: { slug: string; title: string }) {
  return (
    <ReportButton endpoint={`/api/jobs/${encodeURIComponent(slug)}/report`} title={title} noun="job" reasons={JOB_REPORT_REASONS}
      note="Genuine employers never ask candidates to pay for a job." />
  );
}
