import { describe, it, expect } from 'vitest';
import { articleBodyHtml, markSponsoredLinks } from '@/lib/article-body';
import { articlePath, isSponsoredArticle } from '@/lib/seo';

describe('links in paid articles', () => {
  it('marks links that leave the site as sponsored and leaves our own links alone', () => {
    const html = '<p><a href="https://acme.example/buy" target="_blank" rel="noopener">Buy</a> <a href="https://udyaibase.com/tools/x">tool</a> <a href="/news/y">y</a> <a href="https://www.udyaibase.com">home</a></p>';
    const out = markSponsoredLinks(html);
    expect(out).toContain('<a href="https://acme.example/buy" target="_blank" rel="sponsored nofollow noopener">');
    expect(out).toContain('<a href="https://udyaibase.com/tools/x">');
    expect(out).toContain('<a href="/news/y">');
    expect(out).toContain('<a href="https://www.udyaibase.com">');
  });
  it('a look-alike address is not treated as ours', () => {
    expect(markSponsoredLinks('<a href="https://udyaibase.com.evil.example/x">x</a>')).toContain('rel="sponsored nofollow noopener"');
    expect(markSponsoredLinks('<a href="https://notudyaibase.com/x">x</a>')).toContain('rel="sponsored nofollow noopener"');
  });
  it('only paid articles are changed: by type or by the Sponsored switch', () => {
    const content = { html: '<p><a href="https://acme.example">Acme</a></p>' };
    expect(articleBodyHtml({ content, type: 'NEWS' })).not.toContain('sponsored');
    expect(articleBodyHtml({ content, type: 'SPONSORED' })).toContain('rel="sponsored nofollow noopener"');
    expect(articleBodyHtml({ content, type: 'NEWS', isSponsored: true })).toContain('rel="sponsored nofollow noopener"');
    expect(isSponsoredArticle({ type: 'GUIDE', isSponsored: false })).toBe(false);
  });
  it('each type has one public address', () => {
    expect(articlePath('GUIDE', 'a')).toBe('/news/a');
    expect(articlePath('OPINION', 'a')).toBe('/opinions/a');
    expect(articlePath('FOUNDER_STORY', 'a')).toBe('/stories/a');
    expect(articlePath('STARTUP_UPDATE', 'a')).toBe('/stories/a');
  });
});
