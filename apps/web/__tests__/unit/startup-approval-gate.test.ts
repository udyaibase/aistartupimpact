import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');

/**
 * A startup is public only once our team has approved it. Proving ownership of the domain (the verified badge)
 * is not approval. These checks went missing once, which let unapproved startups be opened and searched.
 */
describe('unapproved startups stay private', () => {
  it('the public startup page only loads approved startups, including through an old link', () => {
    const page = src('app/(public)/startups/[slug]/page.tsx');
    const bySlug = page.match(/WHERE slug = \$\{slug\} AND "deletedAt" IS NULL[^\n]*/g) ?? [];
    expect(bySlug.length).toBe(2);
    for (const where of bySlug) expect(where).toContain('"isApproved" = true');
    expect(page).toMatch(/ANY\("previousSlugs"\) AND "deletedAt" IS NULL AND "isApproved" = true/);
  });

  it('site search and its suggestions only return approved, undeleted startups', () => {
    const search = src('app/api/search/route.ts');
    expect(search).toMatch(/FROM "Startup"\s+WHERE\s+"isApproved" = true AND "deletedAt" IS NULL/);
    expect(search.match(/"deletedAt" IS NULL/g)?.length).toBeGreaterThanOrEqual(3); // articles, tools, startups
    const suggest = src('app/api/search/suggestions/route.ts');
    expect(suggest).toMatch(/FROM "Startup"\s+WHERE "isApproved" = true AND "deletedAt" IS NULL/);
  });

  it('reactivating an account only brings back startups that had been approved', () => {
    const route = src('app/api/founder/reactivate/route.ts');
    expect(route).toContain("approvedAt: { not: null }");
    expect(route).not.toMatch(/claimStatus: \{ in: \['CLAIMED', 'VERIFIED'\] \} \}, \{ claimStatus: 'PENDING'/);
  });

  it('the founder portal does not call an unapproved startup live', () => {
    const page = src('app/founder/startups/[slug]/page.tsx');
    expect(page).toContain("{startup.isApproved && (startup.claimStatus === 'CLAIMED' || startup.claimStatus === 'VERIFIED') && (");
    expect(src('app/founder/startups/page.tsx')).toContain("? 'PENDING' : l.claimStatus");
  });
});

describe('unapproved AI tools stay private', () => {
  it('the public tool page only loads live tools, including through an old link', () => {
    expect(src('lib/db.ts')).toContain(`WHERE t.slug = \${slug} AND t."deletedAt" IS NULL AND t.status IN ('APPROVED', 'FEATURED')`);
    expect(src('app/(public)/tools/[slug]/page.tsx')).toMatch(/ANY\("previousSlugs"\) AND "deletedAt" IS NULL AND status IN \('APPROVED', 'FEATURED'\)/);
  });
  it('search finds featured tools as well as approved ones, and nothing else', () => {
    expect(src('app/api/search/route.ts')).toContain(`status IN ('APPROVED', 'FEATURED') AND "deletedAt" IS NULL`);
    expect(src('app/api/search/suggestions/route.ts')).toContain(`status IN ('APPROVED', 'FEATURED') AND "deletedAt" IS NULL`);
  });
  it('reactivating an account only brings back tools our team had approved', () => {
    expect(src('app/api/founder/reactivate/route.ts')).toContain("status: 'ARCHIVED', reviewStatus: 'APPROVED', approvedAt: { not: null }, claimStatus: { not: 'REJECTED' }");
  });
  it('verifying a domain never erases a rejection', () => {
    expect(src('app/api/founder/tools/[id]/verify/route.ts')).toContain(`CASE WHEN "claimStatus" = 'REJECTED' THEN "claimStatus" ELSE 'VERIFIED'::"ClaimStatus" END`);
  });
  it('the founder portal shows a tool as live only when it is public', () => {
    const page = src('app/founder/tools/[slug]/page.tsx');
    expect(page).toContain("const isLive = tool?.status === 'APPROVED' || tool?.status === 'FEATURED';");
    expect(page).toContain('{isLive && (\n        <StatusNote tone="success" title="Your tool is live">');
  });
});
