import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');

/**
 * Fast approval trusts the automatic first look. So anything that changes a waiting listing must throw that look
 * away, or a founder could pass the check with one text and go live with another.
 */
describe('a waiting listing that changes is judged afresh', () => {
  it('startups: an edit clears the label and the fast-approval slot before looking again', () => {
    const actions = src('app/founder/startups/actions.ts');
    expect(actions).toMatch(/!stored\?\.isApproved && \(result\.published\.length > 0 \|\| aiChanged \|\| result\.resubmitted\)/);
    expect(actions).toContain('data: { aiCheckLabel: null, aiCheckReason: null, aiCheckedAt: null, autoApproveAt: null }');
  });
  it('tools: the same, only while the tool is still waiting', () => {
    const actions = src('app/founder/tools/actions.ts');
    expect(actions).toContain("where: { id, status: 'PENDING' }, data: { aiCheckLabel: null, aiCheckReason: null, aiCheckedAt: null, autoApproveAt: null }");
  });
  it('a listing a reviewer turned down goes back to a person, not to fast approval', () => {
    const edits = readFileSync(join(__dirname, '../../../../packages/database/listing-edits.ts'), 'utf8');
    expect(edits).toContain("autoApproveAt: null, autoApproveHeld: true");
    const job = src('lib/listings/fast-approval.ts');
    expect(job).toContain('turnedDownBefore: !!s.reviewReasonCode');
    expect(job).toContain('hostMatchesDomain(s.websiteUrl, s.verifiedDomain)');
  });
  it('publishing happens only if the listing is still waiting and not on hold', () => {
    const job = src('lib/listings/fast-approval.ts');
    expect(job).toContain("where: { id: s.id, isApproved: false, reviewStatus: 'IN_REVIEW', autoApproveHeld: false, autoApproveAt: { lte: now } }");
    expect(job).toContain("where: { id: t.id, status: 'PENDING', autoApproveHeld: false, autoApproveAt: { lte: now } }");
  });
});
