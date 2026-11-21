import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { milestoneAmount, milestoneTypeLabel } from '@/lib/milestones/amount';

const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('milestone amounts read the way people say them', () => {
  it.each([
    [2500000, 'INR', '₹25 lakh'],
    [20000000, 'INR', '₹2 crore'],
    [25000000, 'INR', '₹2.5 crore'],
    [1250000000, 'INR', '₹125 crore'],
    [75000, 'INR', '₹75,000'],
    [150000, null, '₹1.5 lakh'],
    [2000000, 'USD', '$2M'],
    [2500000, 'USD', '$2.5M'],
    [250000, 'USD', '$250K'],
    [900, 'USD', '$900'],
    [1500000000, 'USD', '$1.5B'],
    [3000000, 'EUR', '€3M'],
  ])('%s %s → %s', (amount, currency, shown) => {
    expect(milestoneAmount(amount, currency)).toBe(shown);
  });

  it('nothing is shown for no amount', () => {
    expect(milestoneAmount(null, 'INR')).toBe('');
    expect(milestoneAmount(0, 'INR')).toBe('');
    expect(milestoneAmount('abc', 'INR')).toBe('');
  });

  it('types read as words', () => {
    expect(milestoneTypeLabel('USER_MILESTONE')).toBe('User milestone');
    expect(milestoneTypeLabel('FUNDING')).toBe('Funding');
  });
});

describe('where a founder’s update lives on the site', () => {
  it('the startup page links updates to Stories, not News', () => {
    const page = src('app/(public)/startups/[slug]/page.tsx');
    expect(page).toContain('href={`/stories/${u.slug}`}');
    expect(page).not.toContain('href={`/news/${u.slug}`}');
  });

  it('an update or story opened under /news is sent to its Stories address', () => {
    const page = src('app/(public)/news/[slug]/page.tsx');
    expect(page).toMatch(/article\.type === 'STARTUP_UPDATE' \|\| article\.type === 'FOUNDER_STORY'\) permanentRedirect\(`\/stories\/\$\{article\.slug\}`\)/);
  });
});

describe('where milestones and updates are shown', () => {
  it('the home page has no milestones section', () => {
    const home = src('app/(public)/page.tsx');
    expect(home).not.toMatch(/Startup Milestones|getRecentMilestonesDirect|fetchedMilestones/);
  });
  it('the old Milestones address sends visitors to the startup directory, and is out of the sitemap', () => {
    expect(src('app/(public)/milestones/page.tsx')).toContain("permanentRedirect('/startups')");
    expect(src('app/sitemap.ts')).not.toContain('/milestones');
  });
  it('the startup profile shows its own updates and milestones', () => {
    const page = src('app/(public)/startups/[slug]/page.tsx');
    expect(page).toContain('Latest Updates');
    expect(page).toMatch(/FROM "FounderMilestone"/);
  });
  it('the site-wide article lists (home page lead story, latest, ticker) leave startup updates out', () => {
    const db = src('lib/db.ts');
    expect(db.match(/a\.type <> 'STARTUP_UPDATE'/g)?.length).toBe(2); // featured-only and no-filter lists
    expect(db).toMatch(/SELECT title FROM "Article"\s+WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL AND type <> 'STARTUP_UPDATE'/);
  });
  it('the startup profile lists the founder’s stories in their own box, not under Related News', () => {
    const page = src('app/(public)/startups/[slug]/page.tsx');
    expect(page).toContain("type IN ('STORY', 'FOUNDER_STORY')");
    expect(page).toContain("type NOT IN ('STORY', 'FOUNDER_STORY', 'STARTUP_UPDATE')");
    expect(page).toContain('>Founder Stories</h4>');
  });
  it('the profile shows milestones in the side column', () => {
    const page = src('app/(public)/startups/[slug]/page.tsx');
    const aside = page.slice(page.indexOf('<aside'), page.indexOf('</aside>'));
    expect(aside).toContain('startup.startupMilestones');
    expect(page.slice(0, page.indexOf('<aside'))).not.toContain('startup.startupMilestones.map');
  });
  it('story lists name the founder, not the shared system author', () => {
    expect(src('lib/db.ts')).toMatch(/a\."founderAuthorId" IS NOT NULL THEN COALESCE/);
  });
  it('the Founder Stories list holds founder stories, not updates', () => {
    expect(src('app/(public)/stories/page.tsx')).toMatch(/type: 'FOUNDER_STORY'/);
    expect(src('app/(public)/stories/page.tsx')).not.toContain('STARTUP_UPDATE');
  });
});

describe('the founder’s content list', () => {
  const page = src('app/founder/content/page.tsx');
  it('edit, delete and view are always on show, not only on hover', () => {
    expect(page).not.toMatch(/opacity-0 group-hover:opacity-100/);
  });
  it('milestones can be edited, and published posts can be opened on the site', () => {
    expect(page).toContain('/founder/milestones/${m.id}/edit');
    expect(page).toContain('href={`/stories/${a.slug}`}');
  });
  it('a failed delete is reported', () => {
    expect(page).toMatch(/Couldn’t delete that/);
  });
});

describe('the update form', () => {
  const form = src('components/founder/ContentSubmissionForm.tsx');
  it('no longer offers a Tag or Category that was never saved', () => {
    expect(form).not.toMatch(/UPDATE_TAGS|STORY_CATEGORIES/);
  });
  it('says plainly when a draft is only in this browser', () => {
    expect(form).toContain('Not saved to your account yet');
  });
});
