import { describe, it, expect } from 'vitest';
import { encodeDirectory, decodeDirectory, type DirectoryData } from '@/lib/tools/directory-wire';

const tag = (id: string, name: string, groupId: string, sortOrder: number) =>
  ({ id, name, slug: name.toLowerCase(), emoji: null, groupId, sortOrder, tagCount: 3 });

const sample: DirectoryData = {
  tools: [
    { id: 'tool-1', slug: 'alpha', name: 'Alpha', rating: 4.5, pricing: 'FREE', verdict: null, founderNames: ['A'] },
    { id: 'tool-2', slug: 'beta', name: 'Beta', rating: null, pricing: 'PAID', verdict: 'Good', founderNames: [] },
    { id: 'tool-3', slug: 'gamma', name: 'Gamma', rating: 3, pricing: 'FREEMIUM', verdict: null, founderNames: [] },
  ],
  toolTagMap: { 'tool-1': ['tag-a', 'tag-c'], 'tool-2': ['tag-b'] },
  tagGroups: [
    { id: 'g1', name: 'Platform', slug: 'platform', icon: null, description: null, sortOrder: 1, displayMode: 'chips', maxVisibleDefault: 8,
      tags: [tag('tag-a', 'Web', 'g1', 1), tag('tag-b', 'Mobile', 'g1', 2)] },
    { id: 'g2', name: 'Use', slug: 'use', icon: 'x', description: 'd', sortOrder: 2, displayMode: 'list', maxVisibleDefault: 5,
      tags: [tag('tag-c', 'Writing', 'g2', 1)] },
  ],
};

describe('directory wire format', () => {
  it('round-trips tools, tag links and groups with the same ids', () => {
    const out = decodeDirectory(JSON.parse(JSON.stringify(encodeDirectory(sample))))!;
    expect(out.tools).toEqual(sample.tools);
    expect(out.toolTagMap).toEqual(sample.toolTagMap);
    expect(out.tagGroups.map((g) => ({ ...g, tags: g.tags.map((t) => [t.id, t.name, t.slug, t.groupId]) }))).toEqual(
      sample.tagGroups.map((g) => ({ ...g, tags: g.tags.map((t) => [t.id, t.name, t.slug, t.groupId]) })),
    );
  });

  it('drops links to tags that are not in any group', () => {
    const out = decodeDirectory(encodeDirectory({ ...sample, toolTagMap: { 'tool-1': ['tag-a', 'gone'] } }))!;
    expect(out.toolTagMap).toEqual({ 'tool-1': ['tag-a'] });
  });

  it('is much smaller than the plain JSON', () => {
    expect(JSON.stringify(encodeDirectory(sample)).length).toBeLessThan(JSON.stringify(sample).length);
  });

  it('still reads the older plain format', () => {
    expect(decodeDirectory(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });

  it('returns null for an unreadable response', () => {
    expect(decodeDirectory(null)).toBeNull();
    expect(decodeDirectory({ error: 'x' })).toBeNull();
  });
});
