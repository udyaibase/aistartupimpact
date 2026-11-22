import { describe, it, expect } from 'vitest';
import { toPrefixTsQuery } from '@/lib/search/ts-query';

describe('search words become a safe prefix query', () => {
  it('joins words as prefixes', () => {
    expect(toPrefixTsQuery('AI tools India')).toBe('ai:* & tools:* & india:*');
  });
  it('drops query syntax people might type', () => {
    expect(toPrefixTsQuery("!a | b & (c) :d 'e'")).toBe('a:* & b:* & c:* & d:* & e:*');
    expect(toPrefixTsQuery('!!! ()')).toBe('');
  });
  it('keeps letters in other scripts', () => {
    expect(toPrefixTsQuery('कृषि AI')).toBe('कृषि:* & ai:*');
  });
  it('caps the number and length of words', () => {
    expect(toPrefixTsQuery('w '.repeat(20)).split(' & ')).toHaveLength(8);
    expect(toPrefixTsQuery('x'.repeat(100))).toBe(`${'x'.repeat(40)}:*`);
  });
});
