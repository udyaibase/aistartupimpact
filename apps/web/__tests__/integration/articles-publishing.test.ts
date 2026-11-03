import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  opsCronRun: { create: vi.fn(async () => ({})) },
}));
const refreshSections = vi.hoisted(() => vi.fn());
const runOpsChecks = vi.hoisted(() => vi.fn());
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/revalidate', () => ({ refreshSections }));
vi.mock('@/lib/ops/alert', () => ({ opsAlert: vi.fn() }));
vi.mock('@/lib/ops/checks', () => ({ runOpsChecks }));

const sqlOf = (call: any[]) => (call[0] as TemplateStringsArray).join('?');

describe('scheduled articles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  it('due articles go live with their scheduled time as the publish date; undated published articles get a date', async () => {
    const { publishScheduledArticles } = await import('@/lib/articles/schedule');
    db.$queryRaw.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    db.$executeRaw.mockResolvedValue(3);
    const now = new Date('2026-11-03T10:00:00Z');
    expect(await publishScheduledArticles(now)).toEqual({ published: 2, datesFixed: 3 });
    const publish = sqlOf(db.$queryRaw.mock.calls[0]);
    expect(publish).toMatch(/status = 'PUBLISHED', "publishedAt" = COALESCE\("publishedAt", "scheduledAt"/);
    expect(publish).toMatch(/WHERE status = 'SCHEDULED' AND "deletedAt" IS NULL AND "scheduledAt" <= \?/);
    expect(db.$queryRaw.mock.calls[0]).toContain(now);
    expect(sqlOf(db.$executeRaw.mock.calls[0])).toMatch(/"publishedAt" = COALESCE\("scheduledAt", "createdAt"\)[\s\S]*"publishedAt" IS NULL/);
    expect(refreshSections).toHaveBeenCalledWith(expect.arrayContaining(['news', 'stories', 'opinions', 'home']));
  });

  it('nothing due: no page refresh', async () => {
    const { publishScheduledArticles } = await import('@/lib/articles/schedule');
    db.$queryRaw.mockResolvedValue([]);
    db.$executeRaw.mockResolvedValue(0);
    await publishScheduledArticles();
    expect(refreshSections).not.toHaveBeenCalled();
  });

  it('the job needs the cron secret, records its run, and skips the heavier health checks', async () => {
    const { GET } = await import('@/app/api/admin/publish-scheduled/route');
    expect((await GET(new NextRequest('http://localhost/api/admin/publish-scheduled'))).status).toBe(401);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    db.$queryRaw.mockResolvedValue([]);
    db.$executeRaw.mockResolvedValue(0);
    const res = await GET(new NextRequest('http://localhost/api/admin/publish-scheduled', { headers: { authorization: 'Bearer test-cron-secret' } }));
    expect(res.status).toBe(200);
    expect(db.opsCronRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ job: 'publish-scheduled', ok: true }) }));
    expect(runOpsChecks).not.toHaveBeenCalled();
  });
});

describe('article bodies on the website', () => {
  it('every stored format renders, safely', async () => {
    const { articleBodyHtml } = await import('@/lib/article-body');
    expect(articleBodyHtml({ content: { html: '<p>Hi<script>x</script></p>' } })).toBe('<p>Hi</p>');
    expect(articleBodyHtml({ content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ text: 'A & B' }] }, { type: 'paragraph', content: [{ text: 'Text', marks: [{ type: 'bold' }] }] }] } }))
      .toBe('<h2>A &amp; B</h2><p><strong>Text</strong></p>');
    expect(articleBodyHtml({ content: [{ type: 'paragraph', content: 'Plain <b>not html</b>' }] })).toBe('<p>Plain &lt;b&gt;not html&lt;/b&gt;</p>');
    expect(articleBodyHtml({ content: [], excerpt: 'Summary only' })).toBe('Summary only');
  });
});
