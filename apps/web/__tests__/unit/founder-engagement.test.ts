import { describe, it, expect } from 'vitest';
import { engagementContent, pickEngagementEmail, type FounderFacts } from '@/lib/founder/engagement';

const live: NonNullable<FounderFacts['listing']> = { name: 'Acme AI', slug: 'acme-ai', kind: 'startup', isLive: true, isVerified: true, missing: [], updatedDaysAgo: 5 };
const facts = (over: Partial<FounderFacts> = {}, listing: Partial<typeof live> | null = {}): FounderFacts => ({
  name: 'Asha', accountAgeDays: 100, listing: listing === null ? null : { ...live, ...listing }, viewsLast7Days: 0,
  daysSinceLastPost: 1, openJobs: 1, upcomingEvents: 1, lastSignInDaysAgo: 1, ...over,
});

describe('pickEngagementEmail', () => {
  it('sends nothing to an active founder with nothing to do', () => {
    expect(pickEngagementEmail(facts(), [])).toBeNull();
  });

  it('never sends more than one email a week', () => {
    expect(pickEngagementEmail(facts({}, { missing: ['a logo'] }), [{ type: 'post_job', daysAgo: 6 }])).toBeNull();
    expect(pickEngagementEmail(facts({}, { missing: ['a logo'] }), [{ type: 'post_job', daysAgo: 8 }])).toBe('complete_profile');
  });

  it('waits a few days before asking a new founder to list', () => {
    expect(pickEngagementEmail(facts({ accountAgeDays: 1 }, null), [])).toBeNull();
    expect(pickEngagementEmail(facts({ accountAgeDays: 3 }, null), [])).toBe('list_startup');
  });

  it('asks nothing while a listing waits for review', () => {
    expect(pickEngagementEmail(facts({}, { isLive: false, isVerified: false, missing: ['a logo'] }), [])).toBeNull();
  });

  it('only reports views when there are enough to be worth saying', () => {
    expect(pickEngagementEmail(facts({ viewsLast7Days: 4 }), [])).toBeNull();
    expect(pickEngagementEmail(facts({ viewsLast7Days: 5 }), [])).toBe('views_report');
    expect(pickEngagementEmail(facts({ viewsLast7Days: 50 }), [{ type: 'views_report', daysAgo: 10 }])).toBeNull();
  });

  it('asks verified founders to post, hire and host, one at a time', () => {
    expect(pickEngagementEmail(facts({ daysSinceLastPost: 31 }), [])).toBe('post_update');
    expect(pickEngagementEmail(facts({ daysSinceLastPost: null }), [])).toBe('post_update');
    expect(pickEngagementEmail(facts({ openJobs: 0 }), [])).toBe('post_job');
    expect(pickEngagementEmail(facts({ upcomingEvents: 0 }), [])).toBe('post_event');
  });

  it('doesn’t ask an unverified founder to do what they can’t', () => {
    const f = facts({ daysSinceLastPost: null, openJobs: 0, upcomingEvents: 0 }, { isVerified: false });
    expect(pickEngagementEmail(f, [])).toBe('verify_listing');
    expect(pickEngagementEmail(f, [{ type: 'verify_listing', daysAgo: 8 }])).toBeNull();
  });

  it('respects each email’s cooldown, then moves on', () => {
    const f = facts({ daysSinceLastPost: 40, openJobs: 0 });
    expect(pickEngagementEmail(f, [{ type: 'post_update', daysAgo: 8 }])).toBe('post_job');
    expect(pickEngagementEmail(f, [{ type: 'post_update', daysAgo: 8 }, { type: 'post_job', daysAgo: 8 }])).toBeNull();
  });

  it('stops after four ignored emails, until they sign in again', () => {
    const history = [8, 20, 40, 60].map((daysAgo) => ({ type: 'views_report' as const, daysAgo }));
    expect(pickEngagementEmail(facts({ lastSignInDaysAgo: 200, openJobs: 0 }), history)).toBeNull();
    expect(pickEngagementEmail(facts({ lastSignInDaysAgo: 2, openJobs: 0 }), history)).toBe('post_job');
  });
});

describe('engagementContent', () => {
  it('uses the real number of views, and never mentions a low one', () => {
    expect(engagementContent('views_report', facts({ viewsLast7Days: 20 })).subject).toBe('Acme AI got 20 views this week');
    const low = engagementContent('post_job', facts({ viewsLast7Days: 2, openJobs: 0 }));
    expect(low.paragraphs[0]).not.toContain('2 views');
  });

  it('says exactly what the profile is missing', () => {
    const c = engagementContent('complete_profile', facts({}, { missing: ['a logo', 'your founders', 'your city'] }));
    expect(c.subject).toContain('a logo');
    expect(c.paragraphs[0]).toContain('a logo, your founders and your city');
    expect(c.ctaPath).toBe('/founder/startups/acme-ai');
  });

  it('has wording for every email', () => {
    for (const type of ['list_startup', 'complete_profile', 'verify_listing', 'views_report', 'refresh_profile', 'post_update', 'post_job', 'post_event'] as const) {
      const c = engagementContent(type, facts({ viewsLast7Days: 9 }));
      expect(c.subject.length, type).toBeGreaterThan(5);
      expect(c.ctaPath.startsWith('/'), type).toBe(true);
      expect(c.subject, type).not.toContain('undefined');
    }
  });
});
