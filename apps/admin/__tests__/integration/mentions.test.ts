import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSession = vi.hoisted(() => vi.fn());
vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

const sqlOf = (call: any[]) => (call[0] as TemplateStringsArray).join('?');
const search = async (q: string) => {
  const { GET } = await import('@/app/api/mentions/route');
  return (await GET(new NextRequest(`http://localhost/api/mentions?q=${encodeURIComponent(q)}`))).json();
};

describe('article @-tags search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { role: 'WRITER' } });
  });

  it('suggests only startups and tools listed in the public directory, never founder accounts', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([{ id: 's1', name: 'Sarvam AI', slug: 'sarvam-ai', avatar: null, tagline: 'Indic LLMs' }])
      .mockResolvedValueOnce([{ id: 't1', name: 'Sarvam Translate', slug: 'sarvam-translate', avatar: null, tagline: '' }]);
    const { results } = await search('sarvam');
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    const [startupSql, toolSql] = db.$queryRaw.mock.calls.map(sqlOf);
    expect(startupSql).toMatch(/"Startup"[\s\S]*"deletedAt" IS NULL AND "isApproved" = true/);
    expect(toolSql).toMatch(/"AiTool"[\s\S]*"deletedAt" IS NULL AND status = 'APPROVED'/);
    expect(db.$queryRaw.mock.calls.map(sqlOf).join(' ')).not.toMatch(/FounderUser/);
    expect(results.map((r: any) => [r.type, r.slug])).toEqual([['startup', 'sarvam-ai'], ['tool', 'sarvam-translate']]);
  });

  it('needs an editorial sign-in and at least 2 letters', async () => {
    mockSession.mockResolvedValue({ user: { role: 'EVENT_ORGANIZER' } });
    const { GET } = await import('@/app/api/mentions/route');
    expect((await GET(new NextRequest('http://localhost/api/mentions?q=sarvam'))).status).toBe(401);
    mockSession.mockResolvedValue({ user: { role: 'WRITER' } });
    expect((await search('s')).results).toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
