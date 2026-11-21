import { describe, it, expect } from 'vitest';
import { addHeadingIds, comparableText } from '@/lib/article-headings';

describe('section headings get ids for the contents list', () => {
  it('adds ids in order, reads nested and escaped text, and keeps the rest of the HTML', () => {
    const { html, headings } = addHeadingIds('<p>Intro</p><h2>The <em>first</em> village</h2><p>a &amp; b</p><h2>Fish &amp; chips</h2><h3>Small</h3>');
    expect(headings.map((h) => h.id)).toEqual(['the-first-village', 'fish-chips']);
    expect(headings[0].text).toBe('The first village');
    expect(html).toContain('<h2 id="the-first-village">The <em>first</em> village</h2>');
    expect(html).toContain('<p>a &amp; b</p>');
    expect(html).toContain('<h3>Small</h3>');
  });

  it('keeps ids unique and skips empty headings', () => {
    const { headings, html } = addHeadingIds('<h2>Same</h2><h2></h2><h2>Same</h2>');
    expect(headings.map((h) => h.id)).toEqual(['same', 'same-2']);
    expect(html).toContain('<h2></h2>');
  });

  it('compares text without tags', () => {
    expect(comparableText('<p>We started</p><p>with <b>one</b> village</p>')).toBe('we started with one village');
  });
});
