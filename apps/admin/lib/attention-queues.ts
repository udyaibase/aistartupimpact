/**
 * The work that waits for staff, one entry per queue. Client-safe (no database): the sidebar badges, the dashboard's
 * "Needs attention" panel and the search palette read the labels from here; lib/attention.ts holds the counting.
 * `href` is the admin section that clears the queue, and decides who sees it (lib/section-access.ts).
 */
export interface AttentionQueue {
  href: string;
  /** "3 startups to approve": written for the count that goes in front. */
  one: string;
  many: string;
  /** Only these roles act on it, when that is narrower than who can open the section. */
  roles?: readonly string[];
}

export const ATTENTION_QUEUES: readonly AttentionQueue[] = [
  { href: '/articles', one: 'article to review', many: 'articles to review', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { href: '/startups-dir/review', one: 'startup to review', many: 'startups to review' },
  { href: '/tools-dir', one: 'AI tool to approve', many: 'AI tools to approve' },
  { href: '/tool-reviews', one: 'tool review to moderate', many: 'tool reviews to moderate' },
  { href: '/startup-reviews', one: 'startup review to moderate', many: 'startup reviews to moderate' },
  { href: '/events/review', one: 'event to review', many: 'events to review' },
  { href: '/listing-edits', one: 'listing edit to check', many: 'listing edits to check' },
  { href: '/content-review', one: 'founder story or update to review', many: 'founder stories and updates to review' },
  { href: '/reports', one: 'report to handle', many: 'reports to handle' },
  { href: '/support', one: 'support ticket waiting for a reply', many: 'support tickets waiting for a reply' },
  { href: '/employers', one: 'company check to do', many: 'company checks to do' },
  { href: '/applications', one: 'new job application', many: 'new job applications' },
  { href: '/billing', one: 'ticket refund to finish', many: 'ticket refunds to finish' },
];

export type AttentionCounts = Record<string, number>;

export const attentionText = (q: AttentionQueue, n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? q.one : q.many}`;
export const attentionTotal = (counts: AttentionCounts) => Object.values(counts).reduce((a, b) => a + b, 0);
