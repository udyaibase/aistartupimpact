import { JOB_CATEGORIES } from '@/lib/jobs/composer';

/** Wording shared by the job alert sign-up form (browser) and the server. */
export const JOB_ALERT_CONSENT = 'Email me new jobs that match this alert, about once a week. I can stop them with one click in any email.';

/** "AI Engineer jobs in Bengaluru", "Remote ML Engineer jobs", "AI jobs". */
export function alertTitle(f: { category: string | null; city: string | null; workType?: string | null; remoteOnly?: boolean }): string {
  const role = f.category ? JOB_CATEGORIES.find((c) => c.value === f.category)?.label ?? 'AI' : 'AI';
  const remote = f.remoteOnly || f.workType === 'REMOTE';
  return `${remote ? 'Remote ' : ''}${role} jobs${f.city && !remote ? ` in ${f.city}` : ''}`;
}
