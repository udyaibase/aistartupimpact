import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { can } from '@/lib/employer/roles';
import { openJobsFor } from '@/lib/employer/talent';
import { networkAccess, searchNetwork, sentRequests } from '@/lib/network/intros';
import { INTRO_STATUS_FOR_COMPANY, type IntroStatus } from '@/lib/network/rules';
import NetworkDiscover from '@/components/employer/talent/NetworkDiscover';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Open to opportunities' };

/** Pilot: anonymous job seekers who chose to be found, and the requests this company sent them. */
export default async function NetworkPage() {
  const session = await requirePagePermission('candidates.view');
  if (session.jobIds) redirect('/employer/applications');
  const access = await networkAccess(session.id);
  if (access.reason === 'not_in_pilot') redirect('/employer/talent');
  const [people, jobs, sent] = await Promise.all([searchNetwork(session.id), openJobsFor(session.id), sentRequests(session.id)]);
  return (
    <NetworkDiscover
      people={people}
      jobs={jobs}
      access={access}
      canRequest={can(session.role, 'candidates.move')}
      sent={sent.map((r) => ({
        id: r.id,
        jobTitle: r.Listing.title,
        headline: r.Profile.headline,
        status: r.status as IntroStatus,
        statusText: r.applicationId ? 'Applied' : INTRO_STATUS_FOR_COMPANY[r.status as IntroStatus] ?? r.status,
        createdAt: r.createdAt.toISOString(),
        applicationId: r.applicationId,
      }))}
    />
  );
}
