/**
 * Founder engagement emails: what to send a founder, if anything. Pure logic, so the rules are easy to test and change.
 *
 * Rules that keep these useful and out of spam folders:
 * - At most one email a week per founder, however many things they could do.
 * - Each kind of email has its own cooldown, so nobody hears the same thing every week.
 * - Numbers are always real. A views email needs enough views to be worth saying.
 * - If someone ignores four emails without signing in, we stop until they come back.
 * - Anyone can opt out in one click (checked before this runs).
 */

export type EngagementEmail =
  | 'list_startup' | 'complete_profile' | 'verify_listing' | 'views_report'
  | 'refresh_profile' | 'post_update' | 'post_job' | 'post_event';

export type FounderFacts = {
  name: string;
  accountAgeDays: number;
  /** The startup, or failing that the tool, this founder manages. */
  listing: {
    name: string;
    slug: string;
    kind: 'startup' | 'tool';
    isLive: boolean;
    isVerified: boolean;
    /** Things the public page is missing, in plain words ("a logo"). */
    missing: string[];
    updatedDaysAgo: number;
  } | null;
  viewsLast7Days: number;
  daysSinceLastPost: number | null;
  openJobs: number;
  upcomingEvents: number;
  /** Null when they've never signed in since signing up. */
  lastSignInDaysAgo: number | null;
};

export type SentEmail = { type: EngagementEmail; daysAgo: number };

export const MIN_DAYS_BETWEEN_EMAILS = 7;
export const MAX_UNANSWERED_EMAILS = 4;
export const MIN_VIEWS_TO_REPORT = 5;

const COOLDOWN_DAYS: Record<EngagementEmail, number> = {
  list_startup: 30,
  complete_profile: 30,
  verify_listing: 30,
  views_report: 14,
  refresh_profile: 60,
  post_update: 30,
  post_job: 60,
  post_event: 90,
};

/** The most useful email for this founder right now, or null to send nothing. Earlier rules win. */
export function pickEngagementEmail(facts: FounderFacts, history: SentEmail[]): EngagementEmail | null {
  if (history.some((h) => h.daysAgo < MIN_DAYS_BETWEEN_EMAILS)) return null;

  // Sent since they last signed in, and nothing came of it.
  const lastSeen = facts.lastSignInDaysAgo ?? facts.accountAgeDays;
  if (history.filter((h) => h.daysAgo < lastSeen).length >= MAX_UNANSWERED_EMAILS) return null;

  const ready = (type: EngagementEmail) => !history.some((h) => h.type === type && h.daysAgo < COOLDOWN_DAYS[type]);
  const { listing } = facts;

  if (!listing) return facts.accountAgeDays >= 3 && ready('list_startup') ? 'list_startup' : null;
  // Waiting for review: nothing useful to ask of them yet.
  if (!listing.isLive) return null;

  if (listing.missing.length > 0 && ready('complete_profile')) return 'complete_profile';
  if (listing.kind === 'startup' && !listing.isVerified && ready('verify_listing')) return 'verify_listing';
  if (facts.viewsLast7Days >= MIN_VIEWS_TO_REPORT && ready('views_report')) return 'views_report';
  if (listing.updatedDaysAgo >= 90 && ready('refresh_profile')) return 'refresh_profile';

  // Posting, hiring and events need a verified startup.
  if (listing.kind === 'startup' && listing.isVerified) {
    if ((facts.daysSinceLastPost === null || facts.daysSinceLastPost >= 30) && ready('post_update')) return 'post_update';
    if (facts.openJobs === 0 && ready('post_job')) return 'post_job';
    if (facts.upcomingEvents === 0 && ready('post_event')) return 'post_event';
  }
  return null;
}

export type EngagementContent = { subject: string; title: string; paragraphs: string[]; ctaLabel: string; ctaPath: string };

const views = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'view' : 'views'}`;
const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** The wording of each email. Keep it short, specific to them, and one clear action. */
export function engagementContent(type: EngagementEmail, facts: FounderFacts): EngagementContent {
  const name = facts.listing?.name ?? 'your startup';
  const edit = facts.listing ? `/founder/${facts.listing.kind === 'startup' ? 'startups' : 'tools'}/${facts.listing.slug}` : '/founder/dashboard';
  const seen = facts.viewsLast7Days >= MIN_VIEWS_TO_REPORT ? `${name} got ${views(facts.viewsLast7Days)} this week. ` : '';

  switch (type) {
    case 'list_startup':
      return {
        subject: 'Your startup isn’t on Udyaibase yet',
        title: 'Put your startup in front of people looking for it',
        paragraphs: ['You’ve created your account, but your startup isn’t listed yet. It takes a few minutes, and our team reviews it before it goes live.'],
        ctaLabel: 'List your startup',
        ctaPath: '/founder/startups/new',
      };
    case 'complete_profile':
      return {
        subject: `${name}’s profile is missing ${facts.listing?.missing[0] ?? 'some details'}`,
        title: 'Finish your profile',
        paragraphs: [`${seen}People checking it out can’t see ${list(facts.listing?.missing ?? ['everything'])} yet. A complete profile tells them who you are and why you matter.`],
        ctaLabel: 'Complete your profile',
        ctaPath: edit,
      };
    case 'verify_listing':
      return {
        subject: `Verify ${name} to get your badge and post jobs`,
        title: 'Prove this startup is yours',
        paragraphs: [`${seen}Verifying adds the Verified badge to your profile, and lets you post jobs, stories and updates. You only need a DNS record or a work email.`],
        ctaLabel: 'Verify now',
        ctaPath: '/founder/startups',
      };
    case 'views_report':
      return {
        subject: `${name} got ${views(facts.viewsLast7Days)} this week`,
        title: `${views(facts.viewsLast7Days)} this week`,
        paragraphs: ['People are looking at your profile. Make sure what they see is up to date, and see where they’re coming from.'],
        ctaLabel: 'See your analytics',
        ctaPath: '/founder/analytics',
      };
    case 'refresh_profile':
      return {
        subject: `Is ${name}’s profile still up to date?`,
        title: 'Keep your profile fresh',
        paragraphs: [`${seen}You last updated it about ${Math.floor((facts.listing?.updatedDaysAgo ?? 90) / 30)} months ago. New funding, team or product news? Add it so people see the latest.`],
        ctaLabel: 'Update your profile',
        ctaPath: edit,
      };
    case 'post_update':
      return {
        subject: `What’s new at ${name}?`,
        title: 'Share an update',
        paragraphs: [`${seen}A launch, a customer win or a new hire is enough. Updates publish straight away and help more people find you.`],
        ctaLabel: 'Post an update',
        ctaPath: '/founder/content',
      };
    case 'post_job':
      return {
        subject: `Hiring at ${name}? Post your role on Udyaibase`,
        title: 'Reach people who want to work in AI',
        paragraphs: [`${seen}You have no open roles right now. If you’re hiring, post a job and it appears on your profile and on our AI jobs page.`],
        ctaLabel: 'Post a job',
        ctaPath: '/founder/hiring',
      };
    case 'post_event':
      return {
        subject: `Hosting anything soon at ${name}?`,
        title: 'Bring people together',
        paragraphs: [`${seen}A demo day, launch or meetup is a good way to reach a wider audience. Tag your startup and the event appears on your profile.`],
        ctaLabel: 'Create an event',
        ctaPath: '/organizer/events/create',
      };
  }
}
