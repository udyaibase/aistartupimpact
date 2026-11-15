import { describe, it, expect } from 'vitest';
import { analyzeContentImages, analyzeCoverImage, analyzeSEO } from '@/lib/seo-analyzer';

const base = {
  title: 'Best AI startup tools in India for founders',
  seoTitle: '',
  metaDescription: 'Discover the best AI startup tools in India for founders, with pricing, real reviews and how teams use them every day.',
  focusKeyword: 'AI startup tools',
  slug: 'best-ai-startup-tools-india',
};
const body = (extra = '') =>
  `<p>AI startup tools help founders move faster. ${'Teams compare products and pick what works. '.repeat(30)}</p>${extra}`;

describe('image score', () => {
  it('counts the cover image, which the article page shows with the title as alt text (the reported bug)', () => {
    const images = analyzeCoverImage('https://media.example/cover.jpg', base.title, base.focusKeyword);
    const r = analyzeSEO({ ...base, content: body(), images });
    expect(images[0]).toMatchObject({ hasAlt: true, altText: base.title });
    expect(r.breakdown.images.score).toBe(10);
  });

  it('scores 0 only when there is really no image', () => {
    const r = analyzeSEO({ ...base, content: body(), images: [...analyzeCoverImage(null, base.title, ''), ...analyzeContentImages(body(), '')] });
    expect(r.breakdown.images.score).toBe(0);
  });

  it('counts images in the body, with and without alt text', () => {
    const html = body('<figure><img src="/a.jpg" alt=""></figure><img alt="Founders demo their AI startup tools on stage" src="/b.jpg">');
    const images = analyzeContentImages(html, base.focusKeyword);
    expect(images).toHaveLength(2);
    expect(images[0].hasAlt).toBe(false);
    expect(images[1]).toMatchObject({ src: '/b.jpg', hasAlt: true, isOptimal: true });
    const r = analyzeSEO({ ...base, content: html, images });
    expect(r.breakdown.images.score).toBeGreaterThan(0);
    expect(r.issues.some((i) => i.category === 'Images')).toBe(true);
  });

  it('keeps apostrophes inside alt text', () => {
    const [img] = analyzeContentImages(`<img src='/c.jpg' alt="Bengaluru's first AI hardware lab tour">`, '');
    expect(img.altText).toBe("Bengaluru's first AI hardware lab tour");
    const [img2] = analyzeContentImages('<img src="/d.jpg" alt="Tom &amp; Jerry&#39;s lab">', '');
    expect(img2.altText).toBe("Tom & Jerry's lab");
  });
});

describe('other scores', () => {
  it('gives no title points for a keyword that is not in the title', () => {
    const r = analyzeSEO({ ...base, title: 'A long enough headline about something else entirely', focusKeyword: 'quantum computing', content: body(), images: [] });
    expect(r.breakdown.title.score).toBe(5); // the 5 length points only: no keyword, no position, no power word
  });

  it('survives keywords with regex characters, which used to break the whole panel', () => {
    expect(() => analyzeSEO({ ...base, focusKeyword: 'C++ (AI)', content: body('<p>C++ (AI) is used.</p>'), images: [] })).not.toThrow();
    const r = analyzeSEO({ ...base, focusKeyword: 'Node.js', content: '<p>Node.js and Node.js again, nodexjs is not it.</p>', images: [] });
    expect(r.issues.find((i) => i.message.startsWith('Keyword density'))?.fix).toContain('2 times');
  });

  it('handles an empty article without NaN or fake points', () => {
    const r = analyzeSEO({ ...base, content: '', images: [] });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.issues.find((i) => i.message === 'Content is critically short')?.fix).toContain('currently 0');
  });

  it('sees lists, bold text, headings and links that carry attributes', () => {
    const html = body('<h2 id="a">AI startup tools compared</h2><h2 class="x">Pricing</h2><h3 style="">Free plans</h3><ul class="list"><li>One</li></ul><b class="k">Note</b><a href="/x">x</a> <a class="y" href="/y">y</a>');
    const r = analyzeSEO({ ...base, content: html, images: [] });
    expect(r.recommendations.some((x) => x.title === 'Add Lists and Formatting' || x.title === 'Add More Formatting')).toBe(false);
    expect(r.issues.some((i) => i.message === 'Missing headings')).toBe(false);
    expect(r.recommendations.some((x) => x.title === 'Use Keyword in Headings')).toBe(false);
    expect(r.recommendations.some((x) => x.title === 'Add Internal/External Links')).toBe(false);
  });

  it('adds up to at most 100 with every section at its maximum', () => {
    const r = analyzeSEO({ ...base, content: body(), images: [] });
    const max = Object.values(r.breakdown).reduce((n, b) => n + b.max, 0);
    expect(max).toBe(100);
    for (const b of Object.values(r.breakdown)) expect(b.score).toBeLessThanOrEqual(b.max);
  });
});
