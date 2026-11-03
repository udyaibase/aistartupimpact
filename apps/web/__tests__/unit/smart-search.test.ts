import { describe, it, expect } from 'vitest';
import { normalizeQuery, understandStartupQuery, understandToolQuery, removeChipFromQuery, withinEdits } from '@/lib/search/understand';
import { indexTools, searchTools } from '@/lib/search/tool-search';

describe('understandStartupQuery', () => {
  it('reads a full sentence into filters, ignoring case and filler words', () => {
    const q = understandStartupQuery('FUNDED Fintech startups in Bangalore that raised money');
    expect(q).toMatchObject({ city: 'Bengaluru', funding: 'funded', categoryPrefixes: ['FinTech'] });
    expect(q.groups.map((g) => g[0])).toEqual(['fintech', 'money']);
    expect(q.chips.map((c) => c.label)).toEqual(['Bengaluru', 'Funded', 'FinTech']);
  });

  it('prefers the longer phrase ("series a", "not funded")', () => {
    expect(understandStartupQuery('series a healthtech').stage).toBe('SERIES_A');
    expect(understandStartupQuery('not funded edtech startups').funding).toBe('unfunded');
  });

  it('keeps stopword-only queries harmless', () => {
    const q = understandStartupQuery('the best ai startups');
    expect(q.groups).toEqual([]);
    expect(q.chips).toEqual([]);
  });
});

describe('understandToolQuery', () => {
  it('recognises pricing and expands synonyms', () => {
    const q = understandToolQuery('Free AI tool to write blog posts');
    expect(q.pricing).toEqual(['FREE', 'FREEMIUM', 'OPEN_SOURCE']);
    expect(q.groups[0]).toContain('blog');
    expect(q.groups.map((g) => g[0])).toEqual(['write', 'blog', 'posts']);
  });

  it('does not turn "api" into a hard filter', () => {
    expect(understandToolQuery('code assistant with api').groups.map((g) => g[0])).toContain('api');
  });
});

describe('helpers', () => {
  it('normalises case, accents and punctuation', () => {
    expect(normalizeQuery('  Série-A, BANGALORE!! ')).toBe('serie a bangalore');
  });

  it('removes a chip’s words from the query', () => {
    const q = 'fintech startups in bangalore';
    const chip = understandStartupQuery(q).chips.find((c) => c.kind === 'city')!;
    expect(removeChipFromQuery(q, chip)).toBe('fintech startups');
  });

  it('counts a swapped pair of letters as one typo', () => {
    expect(withinEdits('chatgtp', 'chatgpt', 1)).toBe(true);
    expect(withinEdits('midjourny', 'midjourney', 1)).toBe(true);
    expect(withinEdits('canva', 'notion', 2)).toBe(false);
  });
});

describe('searchTools', () => {
  const tools = [
    { id: '1', name: 'ChatGPT', tagline: 'Conversational assistant', category: 'Personal AI Assistants', pricing: 'FREEMIUM', rating: 4.8 },
    { id: '2', name: 'Platen', tagline: 'Write SEO blog posts', category: 'Blog & Article Writing', pricing: 'FREE', rating: 4.1 },
    { id: '3', name: 'Jasper', tagline: 'Marketing copy and blog writer', category: 'Copywriting', pricing: 'PAID', rating: 4.5 },
    { id: '4', name: 'Descript', tagline: 'Edit videos by editing text', category: 'Video Editing', pricing: 'FREEMIUM', rating: 4.6 },
  ];
  const index = indexTools(tools);

  it('is case-insensitive and typo tolerant on names', () => {
    expect(searchTools(index, 'CHATGPT').tools[0].name).toBe('ChatGPT');
    expect(searchTools(index, 'chatgtp').tools[0].name).toBe('ChatGPT');
  });

  it('applies recognised pricing and ranks by meaning', () => {
    const r = searchTools(index, 'free tool to write blog posts');
    expect(r.tools.map((t) => t.name)).toEqual(['Platen']);
    expect(r.understood.chips.map((c) => c.label)).toEqual(['Free']);
  });

  it('relaxes recognised filters when they leave nothing', () => {
    const r = searchTools(index, 'paid video editing');
    expect(r.relaxed).toBe(true);
    expect(r.tools[0].name).toBe('Descript');
  });

  it('returns nothing for gibberish', () => {
    expect(searchTools(index, 'xyzzyqq').tools).toEqual([]);
  });
});
