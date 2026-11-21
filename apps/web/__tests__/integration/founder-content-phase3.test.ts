import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const SESSION = { userId: 'f1', email: 'meera@startup.test', name: 'Meera', onboardingCompleted: true };
const mockSession = vi.fn();
vi.mock('@/lib/founder-auth', () => ({ getFounderSession: () => mockSession() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, reset: 0 })), getClientIdentifier: () => 'ip',
  rateLimitMessage: () => 'Too many', retryAfterHeaders: () => ({}), contentWriteRateLimit: null, draftSaveRateLimit: null, strictRateLimit: null,
}));
const mockAccess = vi.fn();
vi.mock('@/lib/founder-content-auth', () => ({
  verifyStartupAccess: (id: string) => mockAccess(id),
  getFounderStartups: vi.fn(async () => []),
  UNVERIFIED_STARTUP_ERROR: 'Only verified startups can post updates and stories.',
}));
const refreshed = vi.hoisted(() => [] as string[][]);
vi.mock('@/lib/revalidate', () => ({ refreshPaths: (paths: string[]) => { refreshed.push(paths); } }));
vi.mock('@/lib/cache', () => ({ CK: {}, invalidateCache: vi.fn() }));
vi.mock('@udyaibase/utils', () => ({ generateUniqueSlug: (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));

const db = vi.hoisted(() => ({
  article: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  articleVersion: { count: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  startup: { findUnique: vi.fn() },
  contentActivityLog: { create: vi.fn() },
  founderMilestone: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { POST as createContent } from '@/app/api/founder/content/route';
import { PUT as editContent, DELETE as deleteContent } from '@/app/api/founder/content/[id]/route';
import { POST as createMilestone } from '@/app/api/founder/milestones/route';

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
const params = { params: Promise.resolve({ id: 'a1' }) };
const UPDATE = { startupId: 's1', title: 'We launched in Pune', content: 'Short news.', type: 'STARTUP_UPDATE' };
const STORY = { ...UPDATE, type: 'FOUNDER_STORY', content: `<p>${'How we started. '.repeat(10)}</p>` };
const allPaths = () => refreshed.flat();

describe('founder updates and stories (Phase 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshed.length = 0;
    mockSession.mockResolvedValue(SESSION);
    mockAccess.mockResolvedValue({ authorized: true, role: 'OWNER', userId: 'f1', startupId: 's1', startupVerified: true });
    db.article.findUnique.mockResolvedValue(null);
    db.article.count.mockResolvedValue(0);
    db.user.findUnique.mockResolvedValue({ id: 'system-founder-content' });
    db.startup.findUnique.mockResolvedValue({ slug: 'krishi-mitra' });
    db.article.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    db.article.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', status: 'PUBLISHED', ...data }));
  });

  describe('creating', () => {
    it('publishes a valid update and refreshes its public pages straight away', async () => {
      const res = await createContent(req('/api/founder/content', 'POST', UPDATE));
      expect(res.status).toBe(200);
      const saved = db.article.create.mock.calls[0][0].data;
      expect(saved).toMatchObject({ status: 'PUBLISHED', title: 'We launched in Pune', content: 'Short news.', coverImage: null });
      expect(allPaths()).toEqual(expect.arrayContaining(['/stories', `/stories/${saved.slug}`, '/startups/krishi-mitra']));
    });

    it('a draft is saved without touching public pages', async () => {
      await createContent(req('/api/founder/content', 'POST', { ...UPDATE, isDraft: true }));
      expect(db.article.create.mock.calls[0][0].data.status).toBe('DRAFT');
      expect(refreshed).toEqual([]);
    });

    it.each([
      ['a 600 KB body', { content: 'y'.repeat(600_000) }],
      ['content that is not text', { content: { evil: { nested: [1, 2, 3] } } }],
      ['a javascript: cover image', { coverImage: 'javascript:alert(1)' }],
      ['an http cover image', { coverImage: 'http://example.com/a.png' }],
      ['a summary over 500 characters', { excerpt: 'e'.repeat(501) }],
      ['a title over 200 characters', { title: 't'.repeat(201) }],
    ])('refuses %s', async (_name, bad) => {
      const res = await createContent(req('/api/founder/content', 'POST', { ...UPDATE, ...bad }));
      expect(res.status).toBe(400);
      expect(db.article.create).not.toHaveBeenCalled();
    });

    it('stops at five published updates in a day, and says to save a draft', async () => {
      db.article.count.mockResolvedValue(5);
      const res = await createContent(req('/api/founder/content', 'POST', UPDATE));
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ code: 'daily_limit' });
      expect(db.article.create).not.toHaveBeenCalled();
    });

    it('the daily allowance does not block drafts or stories', async () => {
      db.article.count.mockResolvedValue(5);
      expect((await createContent(req('/api/founder/content', 'POST', { ...UPDATE, isDraft: true }))).status).toBe(200);
      expect((await createContent(req('/api/founder/content', 'POST', STORY))).status).toBe(200);
    });

    it('an update with no text is not published, but can be kept as a draft', async () => {
      expect((await createContent(req('/api/founder/content', 'POST', { ...UPDATE, content: '' }))).status).toBe(400);
      expect((await createContent(req('/api/founder/content', 'POST', { ...UPDATE, content: '', isDraft: true }))).status).toBe(200);
    });

    it('a story under 100 characters is not sent for review, but can be kept as a draft', async () => {
      const short = { ...STORY, content: '<p>too short</p>' };
      const res = await createContent(req('/api/founder/content', 'POST', short));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/at least 100/);
      expect((await createContent(req('/api/founder/content', 'POST', { ...short, isDraft: true }))).status).toBe(200);
    });

    it('a story is stored cleaned, with its plain text, word count and reading time', async () => {
      await createContent(req('/api/founder/content', 'POST', { ...STORY, content: STORY.content + '<script>alert(1)</script><img src=x onerror=alert(1)>' }));
      const saved = db.article.create.mock.calls[0][0].data;
      expect(saved.content).toBe(STORY.content);
      expect(saved.contentText).toMatch(/^How we started\. How we started\./);
      expect(saved).toMatchObject({ wordCount: 30, readTimeMinutes: 1 });
    });

    it('a founder story still goes to review, not live', async () => {
      await createContent(req('/api/founder/content', 'POST', STORY));
      expect(db.article.create.mock.calls[0][0].data).toMatchObject({ status: 'IN_REVIEW', moderationStatus: 'PENDING_REVIEW' });
      expect(refreshed).toEqual([]);
    });
  });

  describe('editing', () => {
    const existing = (over: Record<string, unknown> = {}) => ({
      id: 'a1', slug: 'we-launched', type: 'STARTUP_UPDATE', startupId: 's1', submittedById: 'f1', status: 'PUBLISHED',
      moderationStatus: 'APPROVED', title: 'Old', content: 'Old body', excerpt: null, coverImage: null, ...over,
    });

    it('an edit to a published update refreshes its public page', async () => {
      db.article.findUnique.mockResolvedValue(existing());
      db.articleVersion.count.mockResolvedValue(0);
      const res = await editContent(req('/api/founder/content/a1', 'PUT', { title: 'New title' }), params);
      expect(res.status).toBe(200);
      expect(allPaths()).toEqual(expect.arrayContaining(['/stories/we-launched', '/startups/krishi-mitra']));
    });

    it('refuses an oversized body or a bad cover image on edit too', async () => {
      db.article.findUnique.mockResolvedValue(existing());
      expect((await editContent(req('/api/founder/content/a1', 'PUT', { content: 'y'.repeat(100_001) }), params)).status).toBe(400);
      expect((await editContent(req('/api/founder/content/a1', 'PUT', { coverImage: 'javascript:alert(1)' }), params)).status).toBe(400);
      expect(db.article.update).not.toHaveBeenCalled();
    });

    it('"Publish" on a saved draft update makes it live (it used to stay a draft)', async () => {
      db.article.findUnique.mockResolvedValue(existing({ status: 'DRAFT', moderationStatus: 'NONE' }));
      const res = await editContent(req('/api/founder/content/a1', 'PUT', { title: 'Ready now', publish: true }), params);
      expect(res.status).toBe(200);
      expect(db.article.update.mock.calls[0][0].data).toMatchObject({ status: 'PUBLISHED', moderationStatus: 'APPROVED', publishedAt: expect.any(Date) });
      expect(allPaths()).toContain('/stories/we-launched');
    });

    it('"publish" never skips review for a founder story', async () => {
      db.article.findUnique.mockResolvedValue(existing({ type: 'FOUNDER_STORY', status: 'DRAFT', moderationStatus: 'NONE' }));
      await editContent(req('/api/founder/content/a1', 'PUT', { publish: true }), params);
      expect(db.article.update.mock.calls[0][0].data.status).toBeUndefined();
    });

    it('an unverified startup cannot publish a draft', async () => {
      mockAccess.mockResolvedValue({ authorized: true, role: 'OWNER', userId: 'f1', startupId: 's1', startupVerified: false });
      db.article.findUnique.mockResolvedValue(existing({ status: 'DRAFT', moderationStatus: 'NONE' }));
      const res = await editContent(req('/api/founder/content/a1', 'PUT', { publish: true }), params);
      expect(res.status).toBe(403);
      expect(db.article.update).not.toHaveBeenCalled();
    });

    describe('an approved story that is live', () => {
      const live = () => existing({ type: 'FOUNDER_STORY', title: 'Our story', content: 'Approved text', excerpt: 'Approved summary' });
      beforeEach(() => { db.articleVersion.count.mockResolvedValue(0); });

      it('an edit goes back to review and comes off the public page, with the approved version kept', async () => {
        db.article.findUnique.mockResolvedValue(live());
        db.article.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', ...data }));
        const res = await editContent(req('/api/founder/content/a1', 'PUT', { content: 'Rewritten into something else' }), params);
        expect(await res.json()).toMatchObject({ success: true, sentToReview: true });
        expect(db.article.update.mock.calls[0][0].data).toMatchObject({ status: 'IN_REVIEW', moderationStatus: 'PENDING_REVIEW', content: 'Rewritten into something else' });
        expect(db.articleVersion.create.mock.calls[0][0].data).toMatchObject({ title: 'Our story', content: 'Approved text' });
        expect(db.contentActivityLog.create.mock.calls[0][0].data.action).toBe('RESUBMITTED');
        expect(allPaths()).toContain('/stories/we-launched');
      });

      it.each([
        ['the title', { title: 'A different title' }],
        ['the summary', { excerpt: 'A different summary' }],
        ['the cover image', { coverImage: 'https://cdn.example.com/new.png' }],
      ])('changing %s also goes back to review', async (_name, change) => {
        db.article.findUnique.mockResolvedValue(live());
        await editContent(req('/api/founder/content/a1', 'PUT', change), params);
        expect(db.article.update.mock.calls[0][0].data).toMatchObject({ status: 'IN_REVIEW', moderationStatus: 'PENDING_REVIEW' });
      });

      it('calling it an autosave does not skip the review', async () => {
        db.article.findUnique.mockResolvedValue(live());
        await editContent(req('/api/founder/content/a1', 'PUT', { content: 'Rewritten', isAutoSave: true }), params);
        expect(db.article.update.mock.calls[0][0].data).toMatchObject({ status: 'IN_REVIEW', moderationStatus: 'PENDING_REVIEW' });
      });

      it('saving with nothing changed leaves it live', async () => {
        db.article.findUnique.mockResolvedValue(live());
        const res = await editContent(req('/api/founder/content/a1', 'PUT', { title: 'Our story', content: 'Approved text', excerpt: 'Approved summary', coverImage: '' }), params);
        expect(await res.json()).toMatchObject({ sentToReview: false });
        expect(db.article.update.mock.calls[0][0].data.status).toBeUndefined();
      });

      it('a published update is not reviewed: its edits still go live', async () => {
        db.article.findUnique.mockResolvedValue(existing());
        await editContent(req('/api/founder/content/a1', 'PUT', { content: 'Edited update' }), params);
        expect(db.article.update.mock.calls[0][0].data.status).toBeUndefined();
      });
    });

    it('saving a draft does not refresh public pages', async () => {
      db.article.findUnique.mockResolvedValue(existing({ status: 'DRAFT', moderationStatus: 'NONE' }));
      db.article.update.mockResolvedValue({ id: 'a1', status: 'DRAFT' });
      await editContent(req('/api/founder/content/a1', 'PUT', { title: 'Still a draft' }), params);
      expect(refreshed).toEqual([]);
    });
  });

  it('an edit or delete also refreshes the older /news address of an update', async () => {
    db.article.findUnique.mockResolvedValue({ id: 'a1', slug: 'we-launched', startupId: 's1', submittedById: 'f1', title: 'Old' });
    await deleteContent(req('/api/founder/content/a1', 'DELETE'), params);
    expect(allPaths()).toContain('/news/we-launched');
  });

  it('deleting an update takes it off the public pages straight away', async () => {
    db.article.findUnique.mockResolvedValue({ id: 'a1', slug: 'we-launched', startupId: 's1', submittedById: 'f1', title: 'Old' });
    const res = await deleteContent(req('/api/founder/content/a1', 'DELETE'), params);
    expect(res.status).toBe(200);
    expect(db.article.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { deletedAt: expect.any(Date), status: 'ARCHIVED' } });
    expect(allPaths()).toEqual(expect.arrayContaining(['/stories', '/stories/we-launched', '/startups/krishi-mitra']));
  });

  describe('milestones', () => {
    const MILESTONE = { startupId: 's1', type: 'FUNDING', title: 'Raised a seed round', date: '2026-10-01', amount: '2500000', currency: 'INR' };
    beforeEach(() => {
      db.founderMilestone.findMany.mockResolvedValue([]);
      db.founderMilestone.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'm1', ...data }));
    });

    it('saves a valid milestone and refreshes the startup page', async () => {
      const res = await createMilestone(req('/api/founder/milestones', 'POST', MILESTONE));
      expect(res.status).toBe(200);
      expect(db.founderMilestone.create.mock.calls[0][0].data).toMatchObject({ amount: 2500000, currency: 'INR' });
      expect(allPaths()).toContain('/startups/krishi-mitra');
    });

    it('refreshes only the startup profile: milestones are not shown anywhere else', async () => {
      await createMilestone(req('/api/founder/milestones', 'POST', MILESTONE));
      expect(allPaths()).toContain('/startups/krishi-mitra');
      expect(allPaths()).not.toContain('/milestones');
      expect(allPaths()).not.toContain('/');
    });

    it('asks before saving a second similar milestone, and saves it once the founder confirms', async () => {
      db.founderMilestone.findMany.mockResolvedValue([{ id: 'm0', title: 'Raised a seed round', date: new Date('2026-10-05') }]);
      const asked = await createMilestone(req('/api/founder/milestones', 'POST', MILESTONE));
      expect(asked.status).toBe(409);
      expect(await asked.json()).toMatchObject({ code: 'similar', error: expect.stringContaining('Raised a seed round') });
      expect(db.founderMilestone.create).not.toHaveBeenCalled();

      const confirmed = await createMilestone(req('/api/founder/milestones', 'POST', { ...MILESTONE, confirmSimilar: true }));
      expect(confirmed.status).toBe(200);
      expect(db.founderMilestone.create).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['the year 2999', { date: '2999-01-01' }],
      ['a negative amount', { amount: -5 }],
      ['an amount that is not a number', { amount: 'abc' }],
      ['an unknown currency', { currency: 'DOGE' }],
    ])('refuses %s', async (_name, bad) => {
      const res = await createMilestone(req('/api/founder/milestones', 'POST', { ...MILESTONE, ...bad }));
      expect(res.status).toBe(400);
      expect(db.founderMilestone.create).not.toHaveBeenCalled();
    });
  });
});
