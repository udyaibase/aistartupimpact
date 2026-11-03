import { describe, it, expect, vi, beforeEach } from 'vitest';
const sql = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ sql }));
import { getArticleEntityCards, linkedEntitySlugs } from '@/lib/article-entities';

describe('article preview cards', () => {
  beforeEach(() => sql.mockReset());

  it('finds startups and tools linked from the body (tags or plain links on our site only)', () => {
    const html = '<p><a class="mention" href="/startups/arrowhead">Arrowhead</a> <a href="https://udyaibase.com/tools/Vox/?x=1">Vox</a> '
      + '<a href="https://other.com/startups/evil">x</a> <a href="/news/arrowhead">x</a> <a href="/startups/arrowhead">again</a></p>';
    expect(linkedEntitySlugs(html)).toEqual({ startups: ['arrowhead'], tools: ['vox'] });
  });

  it('builds cards keyed by link path (old slugs too) and skips the database when nothing is linked', async () => {
    expect(await getArticleEntityCards('<p>No links</p>')).toEqual({});
    expect(sql).not.toHaveBeenCalled();

    sql.mockResolvedValueOnce([{
      name: 'Arrowhead', slug: 'arrowhead', previousSlugs: ['arrowhead-ai'], tagline: 'Voice AI', logoUrl: null, isVerified: true,
      category: 'AI', headquartersCity: 'Bengaluru', stage: 'PRE_SERIES_A', foundedYear: 2022, raisedUsd: '3300000.4', lastRoundType: 'Seed', lastRoundAt: '2025-01-02',
    }]);
    const cards = await getArticleEntityCards('<a href="/startups/arrowhead-ai">A</a> <a href="/startups/arrowhead">A</a>');
    expect(Object.keys(cards).sort()).toEqual(['/startups/arrowhead', '/startups/arrowhead-ai']);
    expect(cards['/startups/arrowhead']).toMatchObject({ kind: 'startup', verified: true, stage: 'Pre-Series A', raisedUsd: 3300000, lastRound: { type: 'Seed' } });
  });

  it('never breaks the article when the lookup fails', async () => {
    sql.mockRejectedValueOnce(new Error('db down'));
    expect(await getArticleEntityCards('<a href="/startups/x">x</a>')).toEqual({});
  });
});
