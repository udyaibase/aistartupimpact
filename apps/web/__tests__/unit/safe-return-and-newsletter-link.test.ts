import { describe, it, expect } from 'vitest';
import { safeReturnPath } from '@/lib/safe-return';
import { newsletterLinkSignature, newsletterLinkValid } from '@/lib/newsletter-link';

describe('safeReturnPath', () => {
  it('keeps paths on this site', () => {
    expect(safeReturnPath('/founder/hiring?tab=jobs#top')).toBe('/founder/hiring?tab=jobs#top');
  });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/\\/evil.example', 'javascript:alert(1)', '', null, undefined, 42])(
    'falls back for %s',
    (v) => expect(safeReturnPath(v)).toBe('/profile'),
  );
});

describe('newsletter link signature', () => {
  const secret = 'shared-secret';
  it('accepts a link signed for exactly this campaign, reader and address', () => {
    process.env.INTERNAL_API_SECRET = secret;
    const sig = newsletterLinkSignature('c1', 'a@b.co', 'https://example.com/x');
    expect(newsletterLinkValid('c1', 'a@b.co', 'https://example.com/x', sig)).toBe(true);
    expect(newsletterLinkValid('c1', 'a@b.co', 'https://evil.example', sig)).toBe(false);
    expect(newsletterLinkValid('c1', 'other@b.co', 'https://example.com/x', sig)).toBe(false);
    expect(newsletterLinkValid('c1', 'a@b.co', 'https://example.com/x', null)).toBe(false);
  });
  it('accepts nothing when the secret is not set', () => {
    delete process.env.INTERNAL_API_SECRET;
    expect(newsletterLinkSignature('c1', 'a@b.co', 'https://example.com/x')).toBeNull();
    expect(newsletterLinkValid('c1', 'a@b.co', 'https://example.com/x', 'anything')).toBe(false);
  });
});
