import { describe, it, expect } from 'vitest';
import { buildArticleMetadata } from '@/lib/seo';

describe('article SEO settings from the admin', () => {
  const base = { title: 'Sarvam raises Series B', excerpt: 'Summary', slug: 'sarvam-series-b', coverImage: 'https://media.udyaibase.com/c.jpg' };

  it('defaults to the article title, summary and cover', () => {
    const m: any = buildArticleMetadata(base);
    expect(m.title).toBe(base.title);
    expect(m.description).toBe('Summary');
    expect(m.robots).toBeUndefined();
    expect(m.openGraph.images[0].url).toBe(base.coverImage);
  });

  it('SEO title, description, canonical, social image and no-index win when set', () => {
    const m: any = buildArticleMetadata({
      ...base, seoTitle: 'Sarvam AI Series B: $41M for Indic LLMs', seoDescription: 'What the round means', canonicalUrl: 'https://example.com/original',
      ogImage: 'https://media.udyaibase.com/og.png', noIndex: true,
    });
    expect(m.title).toBe('Sarvam AI Series B: $41M for Indic LLMs');
    expect(m.description).toBe('What the round means');
    expect(m.alternates.canonical).toBe('https://example.com/original');
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.openGraph.title).toBe('Sarvam AI Series B: $41M for Indic LLMs');
    expect(m.openGraph.images[0].url).toBe('https://media.udyaibase.com/og.png');
    expect(m.twitter.images).toEqual(['https://media.udyaibase.com/og.png']);
  });
});
