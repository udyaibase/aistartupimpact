import { describe, it, expect } from 'vitest';
import { autoApproveChecks, autoApproveEligible, domainLooksAi, domainParts, sanitizeAutoApprove, DEFAULT_AUTO_APPROVE } from '@udyaibase/utils/auto-approve';
import { aiCheckMessages } from '@udyaibase/utils/startup-ai-check';

const on = { ...DEFAULT_AUTO_APPROVE, enabled: true };
const good = { ownershipProven: true, domain: 'acme.ai', aiCheckLabel: 'LIKELY_AI', complete: true, duplicates: 0, turnedDownBefore: false, held: false };

describe('does the address look like an AI company’s', () => {
  it.each(['acme.ai', 'https://www.acme.ai/about', 'acme-ai.com', 'ai-acme.io', 'acmeai.com', 'aiacme.co.in', 'openai.com', 'krutrim-ai.in'])('yes: %s', (d) => {
    expect(domainLooksAi(d).ok).toBe(true);
  });
  it.each(['acme.com', 'visitdubai.com', 'dubai.ai', 'chai.ai', 'gmail.com', 'paintworks.com', 'airtable.com', 'fairprice.in', 'thai.com', 'kai.com', 'mountaingear.com', 'retailhub.co.in', ''])('no: %s', (d) => {
    expect(domainLooksAi(d).ok).toBe(false);
  });
  it('reads the company’s own part of the address', () => {
    expect(domainParts('https://app.acme-ai.co.in/x')).toEqual({ host: 'app.acme-ai.co.in', name: 'acme-ai', tld: 'in' });
    expect(domainParts('not a domain')).toBeNull();
  });
  it('a word added to the block list stops counting', () => {
    expect(domainLooksAi('bonzai.ai', [...DEFAULT_AUTO_APPROVE.blockWords, 'bonzai']).ok).toBe(false);
  });
});

describe('who qualifies for fast approval', () => {
  it('needs every check, and the switch on', () => {
    expect(autoApproveEligible(good, on)).toBe(true);
    expect(autoApproveEligible(good, { ...on, enabled: false })).toBe(false);
  });
  it.each([
    ['ownership not proven', { ownershipProven: false }],
    ['an ordinary address', { domain: 'acme.com' }],
    ['first look unsure', { aiCheckLabel: 'UNCLEAR' }],
    ['first look not run', { aiCheckLabel: null }],
    ['details missing', { complete: false }],
    ['a duplicate website', { duplicates: 1 }],
    ['turned down before', { turnedDownBefore: true }],
    ['on hold', { held: true }],
  ])('no when %s', (_name, change) => {
    expect(autoApproveEligible({ ...good, ...change }, on)).toBe(false);
  });
  it('an AI address alone is never enough', () => {
    const failed = autoApproveChecks({ ...good, ownershipProven: false, aiCheckLabel: 'LIKELY_NOT_AI' }, on).filter((c) => !c.ok).map((c) => c.key);
    expect(failed).toEqual(['ownership', 'aiCheck']);
  });
});

describe('settings', () => {
  it('are off unless switched on, and kept within sensible limits', () => {
    expect(sanitizeAutoApprove(null)).toMatchObject({ enabled: false, delayMinutes: 15, dailyCap: 20 });
    expect(sanitizeAutoApprove({ enabled: 'yes', delayMinutes: 0, dailyCap: 99999 })).toMatchObject({ enabled: false, delayMinutes: 5, dailyCap: 500 });
    expect(sanitizeAutoApprove({ enabled: true, blockWords: ['Dubai ', 'x', 42, 'chai'] }).blockWords).toEqual(['dubai', 'chai']);
  });
});

describe('the first look for tools', () => {
  it('asks about the tool with its features instead of the startup question', () => {
    const [, user] = aiCheckMessages({ kind: 'tool', name: 'Scribe', description: 'Writes meeting notes.', features: ['Speech to text with our own model'] });
    expect(user.content).toContain('AI tools directory');
    expect(user.content).toContain('Speech to text with our own model');
    expect(user.content).not.toContain('How does your product use AI');
  });
});

describe('the website must be the one ownership was proven for', () => {
  it('a look-alike address does not pass', async () => {
    const { hostMatchesDomain } = await import('@udyaibase/utils/auto-approve');
    expect(hostMatchesDomain('https://www.acme.ai/x', 'acme.ai')).toBe(true);
    expect(hostMatchesDomain('https://app.acme.ai', 'acme.ai')).toBe(true);
    expect(hostMatchesDomain('https://evil-acme.ai', 'acme.ai')).toBe(false);
    expect(hostMatchesDomain('https://acme.ai.evil.example', 'acme.ai')).toBe(false);
    expect(hostMatchesDomain('https://acme.ai', null)).toBe(false);
  });
  it('an emptied word list falls back to the built-in one', () => {
    expect(sanitizeAutoApprove({ enabled: true, blockWords: [] }).blockWords).toEqual(DEFAULT_AUTO_APPROVE.blockWords);
  });
});
