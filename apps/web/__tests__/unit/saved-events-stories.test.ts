import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const sql = vi.fn();
const getUserSession = vi.fn();
vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sql(...args) }));
vi.mock('@/lib/user-session', () => ({ getUserSession: () => getUserSession() }));

import * as events from '@/app/api/bookmarks/events/route';
import * as stories from '@/app/api/bookmarks/stories/route';
import * as check from '@/app/api/bookmarks/check/route';

const json = (url: string, body: unknown, method = 'POST') =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
// The sql tag gets (strings, ...values): join the strings to inspect the query text.
const queryText = (call: unknown[]) => (call[0] as string[]).join('?');

beforeEach(() => {
  sql.mockReset();
  getUserSession.mockReset();
});

describe('saved events API', () => {
  it('needs a signed-in reader', async () => {
    getUserSession.mockResolvedValue(null);
    expect((await events.GET()).status).toBe(401);
    expect((await events.POST(json('http://x/api/bookmarks/events', { eventSlug: 'a' }))).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('rejects a missing slug', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    expect((await events.POST(json('http://x/api/bookmarks/events', {}))).status).toBe(400);
    expect((await events.POST(json('http://x/api/bookmarks/events', { eventSlug: 'x'.repeat(201) }))).status).toBe(400);
  });

  it('saves only public, published events and is idempotent', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([{ id: 's1' }]);
    const res = await events.POST(json('http://x/api/bookmarks/events', { eventSlug: 'demo-day' }));
    expect(res.status).toBe(200);
    const q = queryText(sql.mock.calls[0]);
    expect(q).toContain("visibility <> 'INVITE_ONLY'");
    expect(q).toContain('"deletedAt" IS NULL');
    expect(q).toContain('ON CONFLICT');
    expect(sql.mock.calls[0]).toContain('u1');
    expect(sql.mock.calls[0]).toContain('demo-day');
  });

  it('returns 404 for an event that is not public', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await events.POST(json('http://x/api/bookmarks/events', { eventSlug: 'private' }))).status).toBe(404);
  });

  it('treats an already-saved event as success', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ '?column?': 1 }]);
    expect((await events.POST(json('http://x/api/bookmarks/events', { eventSlug: 'demo-day' }))).status).toBe(200);
  });

  it('unsaves only the reader’s own row', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([]);
    const res = await events.DELETE(new NextRequest('http://x/api/bookmarks/events?eventSlug=demo-day', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(queryText(sql.mock.calls[0])).toContain('se."userId" = ');
    expect(sql.mock.calls[0]).toContain('u1');
  });
});

describe('saved stories API', () => {
  it('saves a published story', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await stories.POST(json('http://x/api/bookmarks/stories', { storySlug: 'big-raise' }));
    expect(res.status).toBe(200);
    expect(queryText(sql.mock.calls[0])).toContain("status = 'PUBLISHED'");
  });

  it('moves old browser saves in one capped, de-duplicated batch', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([]);
    const slugs = [...Array.from({ length: 80 }, (_, i) => `s-${i}`), 's-1', 42, ''];
    const res = await stories.POST(json('http://x/api/bookmarks/stories', { storySlugs: slugs }));
    expect(res.status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(1); // no per-slug existence check for batches
    const passed = sql.mock.calls[0].find((v: unknown) => Array.isArray(v) && typeof v[0] === 'string' && v[0].startsWith('s-')) as string[];
    expect(passed).toHaveLength(50);
    expect(new Set(passed).size).toBe(50);
  });

  it('returns 404 for an unpublished story', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await stories.POST(json('http://x/api/bookmarks/stories', { storySlug: 'draft' }))).status).toBe(404);
  });
});

describe('bookmark check', () => {
  it('reports saved events and stories by slug', async () => {
    getUserSession.mockResolvedValue({ id: 'u1' });
    sql.mockResolvedValueOnce([{ slug: 'demo-day' }]).mockResolvedValueOnce([{ slug: 'big-raise' }]);
    const res = await check.GET(new NextRequest('http://x/api/bookmarks/check?eventSlugs=demo-day,other&storySlugs=big-raise'));
    const data = await res.json();
    expect(data.saved).toEqual({ 'event-demo-day': true, 'story-big-raise': true });
  });

  it('returns nothing for signed-out visitors', async () => {
    getUserSession.mockResolvedValue(null);
    const data = await (await check.GET(new NextRequest('http://x/api/bookmarks/check?eventSlugs=a'))).json();
    expect(data.saved).toEqual({});
    expect(sql).not.toHaveBeenCalled();
  });
});
