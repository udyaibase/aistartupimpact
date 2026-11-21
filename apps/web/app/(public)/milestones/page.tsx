import { permanentRedirect } from 'next/navigation';

/**
 * There is no site-wide list of milestones: a startup's milestones are shown on its own profile. This address used to
 * be that list, so old links and search results are sent to the startup directory instead of a dead page.
 */
export default function MilestonesPage() {
  permanentRedirect('/startups');
}
