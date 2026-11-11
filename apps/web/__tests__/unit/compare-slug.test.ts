import { describe, it, expect } from 'vitest';
import { canonicalCompareSlug, compareHref } from '@/lib/tools/compare-slug';

describe('canonicalCompareSlug', () => {
  it('puts tools in alphabetical order', () => {
    expect(canonicalCompareSlug('zapier-vs-airtable')).toBe('airtable-vs-zapier');
    expect(canonicalCompareSlug('c-vs-a-vs-b')).toBe('a-vs-b-vs-c');
  });

  it('leaves an already canonical slug unchanged', () => {
    expect(canonicalCompareSlug('airtable-vs-zapier')).toBe('airtable-vs-zapier');
  });

  it('drops a repeated tool', () => {
    expect(canonicalCompareSlug('b-vs-a-vs-b')).toBe('a-vs-b');
  });

  it('ignores anything that is not a 2–3 tool comparison', () => {
    expect(canonicalCompareSlug('chatgpt')).toBeNull();
    expect(canonicalCompareSlug('a-vs-a')).toBeNull();
    expect(canonicalCompareSlug('a-vs-b-vs-c-vs-d')).toBeNull();
    expect(canonicalCompareSlug('a-vs-b/extra')).toBeNull();
    expect(canonicalCompareSlug('')).toBeNull();
  });
});

describe('compareHref', () => {
  it('builds the canonical URL whatever order the tools were picked in', () => {
    expect(compareHref(['notion', 'clickup'])).toBe('/tools/compare/clickup-vs-notion');
    expect(compareHref(['clickup', 'notion'])).toBe('/tools/compare/clickup-vs-notion');
  });
});
