import { describe, it, expect } from 'vitest';
import { changedListingFields, decideListingEdit, listingValueText, sameListingValue, websiteDomain } from '@udyaibase/utils';
import { canEditStartup, canManageTeam } from '@/lib/founder-team-permissions';

const verified = { isLive: true, isVerified: true };
const unverified = { isLive: true, isVerified: false };

describe('decideListingEdit', () => {
  it('sends a verified founder’s name, website and logo to review, and publishes the rest', () => {
    expect(decideListingEdit(verified, ['description', 'websiteUrl', 'tagline', 'logoUrl', 'name', 'fundingRounds'])).toEqual({
      publish: ['description', 'tagline', 'fundingRounds'],
      review: ['websiteUrl', 'logoUrl', 'name'],
    });
  });

  it('sends everything from an unverified founder to review', () => {
    expect(decideListingEdit(unverified, ['description', 'socialLinks'])).toEqual({ publish: [], review: ['description', 'socialLinks'] });
  });

  it('applies edits directly to a listing that isn’t public yet', () => {
    expect(decideListingEdit({ isLive: false, isVerified: false }, ['name', 'description'])).toEqual({ publish: ['name', 'description'], review: [] });
  });
});

describe('changedListingFields', () => {
  it('finds only real changes', () => {
    const current = { name: 'Acme', tagline: 'Old', linkedinUrl: null, socialLinks: null, faqs: [{ question: 'Q', answer: 'A', order: 0 }] };
    const incoming = { name: 'Acme ', tagline: 'New', linkedinUrl: '', socialLinks: [], faqs: [{ order: 0, answer: 'A', question: 'Q' }], description: undefined };
    expect(changedListingFields(current, incoming)).toEqual(['tagline']);
  });

  it('treats empty the same however it’s stored', () => {
    for (const a of [null, undefined, '', '  ', []]) expect(sameListingValue(a, null)).toBe(true);
    expect(sameListingValue(0, null)).toBe(false);
    expect(sameListingValue(false, null)).toBe(false);
  });
});

describe('listingValueText', () => {
  it('shows values plainly for review', () => {
    expect(listingValueText(null)).toBe('(empty)');
    expect(listingValueText(true)).toBe('Yes');
    expect(listingValueText('https://acme.ai')).toBe('https://acme.ai');
  });
});

describe('websiteDomain', () => {
  it('keeps a badge across small address changes, not across domains', () => {
    expect(websiteDomain('https://www.acme.ai/about')).toBe(websiteDomain('http://acme.ai'));
    expect(websiteDomain('https://app.acme.ai')).toBe('acme.ai');
    expect(websiteDomain('https://acme.co.in')).toBe('acme.co.in');
    expect(websiteDomain('https://acme.ai')).not.toBe(websiteDomain('https://other.ai'));
  });
});

describe('team permissions', () => {
  it('matches the agreed table', () => {
    expect(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'].map((r) => canEditStartup(r as never))).toEqual([true, true, true, false]);
    expect(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'].map((r) => canManageTeam(r as never))).toEqual([true, true, false, false]);
  });
});
