import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The route used to fail on its first query (SELECT DISTINCT ordered by a column it didn't select) and on the tool
 * queries (AiTool has no "shortDescription"), and its catch turned every failure into an empty list. This fakes the
 * database and checks the SQL the route sends, plus that a full mix of results comes back.
 */
const { queries, sql } = vi.hoisted(() => {
  process.env.USER_JWT_SECRET = 'test-only-user-secret';
  const queries: string[] = [];
  const rows = (text: string): unknown[] => {
    if (text.includes('"WebUserInteraction"')) return [{ entityType: 'tool', entityId: 't9' }];
    if (text.includes('"WebUserInterest"')) return [{ categoryId: 'cat1' }];
    if (text.includes('FROM "WebUser"')) return [{ primaryIntent: 'looking_for_jobs', cityId: null, onboardingCompleted: true }];
    if (text.includes('FROM "AiTool"')) return [{ id: 't1', name: 'Tool', entityType: 'tool', shortDescription: 'Does things' }];
    if (text.includes('FROM "Startup"')) return [{ id: 's1', name: 'Startup', entityType: 'startup' }];
    if (text.includes('"JobBoardListing"')) return [{ id: 'j1', name: 'Job', entityType: 'job' }];
    return [];
  };
  // Each sql`` call returns a thenable carrying its text. Fragments (sql`AND ...`) are never awaited, only
  // interpolated, so they contribute their text to the outer query.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => {
      const v = values[i];
      const part = i < values.length ? (v && typeof v === 'object' && 'text' in v ? (v as { text: string }).text : `$${i + 1}`) : '';
      return acc + s + part;
    }, '');
    return {
      text,
      then(resolve: (r: unknown[]) => unknown, reject: (e: unknown) => unknown) {
        queries.push(text);
        return Promise.resolve(rows(text)).then(resolve, reject);
      },
    };
  };
  return { queries, sql };
});
vi.mock('@/lib/db', () => ({ sql }));

import { SignJWT } from 'jose';
import { GET } from '@/app/api/user/recommendations/route';

async function signedIn() {
  const token = await new SignJWT({ userId: 'u1' }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('test-only-user-secret'));
  return new NextRequest('https://udyaibase.com/api/user/recommendations', { headers: { cookie: `user-token=${token}` } });
}

beforeEach(() => { queries.length = 0; });

describe('GET /api/user/recommendations', () => {
  it('recent views are grouped and ordered by latest view (valid in Postgres)', async () => {
    await GET(await signedIn());
    const recent = queries.find((q) => q.includes('"WebUserInteraction"'))!;
    expect(recent).not.toMatch(/SELECT DISTINCT/);
    expect(recent).toMatch(/GROUP BY "entityType", "entityId"/);
    expect(recent).toMatch(/ORDER BY MAX\("createdAt"\) DESC/);
  });

  it('tool queries read AiTool.tagline (there is no shortDescription column)', async () => {
    await GET(await signedIn());
    const tools = queries.filter((q) => q.includes('FROM "AiTool"'));
    expect(tools.length).toBeGreaterThan(0);
    for (const q of tools) {
      expect(q).toContain('tagline AS "shortDescription"');
      expect(q).not.toContain('"logoUrl", "shortDescription"');
    }
  });

  it('returns tools, startups and jobs instead of an empty fallback', async () => {
    const { items } = await (await GET(await signedIn())).json();
    expect(new Set(items.map((i: { entityType: string }) => i.entityType))).toEqual(new Set(['tool', 'startup', 'job']));
  });

  it('signed-out visitors get an empty list without a database call', async () => {
    const res = await GET(new NextRequest('https://udyaibase.com/api/user/recommendations'));
    expect(await res.json()).toEqual({ items: [] });
    expect(queries).toHaveLength(0);
  });
});
