import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * "For you": fakes the database, checks the SQL stays valid (grouped recent views, real column names) and that
 * ranking follows what the person told us, with a reason on every card and the same order on every visit.
 */
const { queries, sql, me } = vi.hoisted(() => {
  process.env.USER_JWT_SECRET = 'test-only-user-secret';
  const queries: string[] = [];
  const me = {
    intents: ['looking_for_jobs', 'following_startups', 'reading_news'] as string[],
    topics: ['health'] as string[],
    jobPrefs: { roles: ['ML_ENGINEER'], experience: 'mid', workModes: ['REMOTE'] } as unknown,
    cityName: 'Bengaluru' as string | null,
  };
  const rows = (text: string): unknown[] => {
    if (text.includes('"WebUserInteraction"')) return [{ entityType: 'tool', entityId: 't9', categoryId: 'cat9' }];
    if (text.includes('"WebUserInterest"')) return [{ categoryId: 'cat1' }];
    // The shared sign-in check (account open, sign-in not ended).
    if (text.includes('FROM "WebUser" u')) return [{ id: 'u1', email: 'u1@example.com' }];
    if (text.includes('SELECT "onboardingCompleted" FROM "WebUser"')) return [{ onboardingCompleted: true }];
    if (text.includes('FROM "WebUser" w')) return [{ ...me, primaryIntent: me.intents[0] ?? null }];
    if (text.includes('FROM "Article"')) return [
      { id: 'a1', title: 'Markets this week', slug: 'markets', excerpt: null, coverImage: null },
      { id: 'a2', title: 'AI hospital triage goes live', slug: 'triage', excerpt: 'A health first', coverImage: null },
    ];
    if (text.includes('FROM "AiTool"')) return [{ id: 't1', name: 'Tool', slug: 'tool', tagline: 'Does things', logoUrl: null, avgRating: 4.5, categoryId: 'cat1', categoryName: 'Writing' }];
    if (text.includes('FROM "Startup"')) return [
      { id: 's1', name: 'PayCo', slug: 'payco', tagline: null, logoUrl: null, category: 'FinTech' },
      { id: 's2', name: 'MediAI', slug: 'mediai', tagline: null, logoUrl: null, category: 'HealthTech & BioTech' },
    ];
    if (text.includes('"JobBoardListing"')) return [
      { id: 'j1', title: 'Designer', slug: 'designer', category: 'AI_DESIGNER', city: 'Mumbai', workType: 'ONSITE', experienceMin: 2, experienceMax: 4, company: 'A', logoUrl: null },
      { id: 'j2', title: 'ML Engineer', slug: 'ml', category: 'ML_ENGINEER', city: 'Pune', workType: 'REMOTE', experienceMin: 3, experienceMax: 6, company: 'B', logoUrl: null },
      { id: 'j3', title: 'Backend', slug: 'backend', category: 'BACKEND_ENGINEER', city: 'Bengaluru', workType: 'HYBRID', experienceMin: null, experienceMax: null, company: 'C', logoUrl: null },
    ];
    if (text.includes('FROM "Event"')) return [];
    return [];
  };
  // Each sql`` call returns a thenable carrying its text; fragments are only interpolated, never awaited.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => {
      const v = values[i];
      const part = i < values.length ? (v && typeof v === 'object' && 'text' in v ? (v as { text: string }).text : `$${i + 1}`) : '';
      return acc + s + part;
    }, '');
    const p = {
      text,
      then(resolve: (r: unknown[]) => unknown, reject: (e: unknown) => unknown) {
        queries.push(text);
        return Promise.resolve(rows(text)).then(resolve, reject);
      },
    };
    return p;
  };
  return { queries, sql, me };
});
vi.mock('@/lib/db', () => ({ sql }));

import { SignJWT } from 'jose';
import { GET } from '@/app/api/user/recommendations/route';
import { slotsFor } from '@/lib/personalization/recommend';

async function signedIn() {
  const token = await new SignJWT({ userId: 'u1' }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('test-only-user-secret'));
  return new NextRequest('https://udyaibase.com/api/user/recommendations', { headers: { cookie: `user-token=${token}` } });
}
type Item = { type: string; id: string; reason: string; href: string };
const items = async (): Promise<Item[]> => (await (await GET(await signedIn())).json()).items;

beforeEach(() => {
  queries.length = 0;
  me.intents = ['looking_for_jobs', 'following_startups', 'reading_news'];
  me.topics = ['health'];
});

describe('GET /api/user/recommendations', () => {
  it('recent views are grouped and ordered by latest view (valid in Postgres)', async () => {
    await GET(await signedIn());
    const recent = queries.find((q) => q.includes('"WebUserInteraction"'))!;
    expect(recent).not.toMatch(/SELECT DISTINCT/);
    expect(recent).toMatch(/GROUP BY "entityType", "entityId"/);
    expect(recent).toMatch(/ORDER BY MAX\("createdAt"\) DESC/);
  });

  it('tool queries read AiTool.tagline (there is no shortDescription column)', async () => {
    me.intents = ['exploring_tools'];
    await GET(await signedIn());
    const tools = queries.filter((q) => q.includes('FROM "AiTool"'));
    expect(tools.length).toBeGreaterThan(0);
    for (const q of tools) expect(q).not.toContain('shortDescription');
  });

  it('puts what they asked for first, with the reason on every card', async () => {
    const list = await items();
    expect(list.every((i) => i.reason && i.href.startsWith('/'))).toBe(true);
    // First card is the most-wanted kind (jobs), and the job matching their role leads.
    expect(list[0]).toMatchObject({ type: 'job', id: 'j2', reason: 'Matches ML Engineer' });
    // Job in their city comes before one that matches nothing.
    const jobs = list.filter((i) => i.type === 'job').map((i) => i.id);
    expect(jobs.indexOf('j3')).toBeLessThan(jobs.indexOf('j1'));
    // Startups and news in a topic they follow come first.
    expect(list.find((i) => i.type === 'startup')).toMatchObject({ id: 's2', reason: 'HealthTech startup' });
    expect(list.find((i) => i.type === 'article')).toMatchObject({ id: 'a2', reason: 'Because you follow HealthTech' });
  });

  it('shows the same order on every visit (no shuffle)', async () => {
    const a = (await items()).map((i) => i.id);
    const b = (await items()).map((i) => i.id);
    expect(b).toEqual(a);
  });

  it('signed-out visitors get an empty list without a database call', async () => {
    const res = await GET(new NextRequest('https://udyaibase.com/api/user/recommendations'));
    expect(await res.json()).toEqual({ items: [] });
    expect(queries).toHaveLength(0);
  });
});

describe('slots', () => {
  it('gives the first reason the most cards and keeps one of everything else', () => {
    const s = slotsFor(['looking_for_jobs', 'reading_news']);
    expect(s.get('job')).toBe(5);
    expect(s.get('article')).toBe(4);
    expect(s.get('tool')).toBe(1);
    expect(s.get('event')).toBe(1);
  });
  it('without answers shows a mix', () => {
    expect([...slotsFor([]).values()].every((n) => n === 2)).toBe(true);
  });
});
