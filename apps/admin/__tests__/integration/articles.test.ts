import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());
const refreshPublic = vi.hoisted(() => vi.fn());
const uploadToMediaLibrary = vi.hoisted(() => vi.fn());
vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit-log', () => ({ logAuditEvent: audit, canDelete: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/refresh-public', () => ({ refreshPublic }));
vi.mock('@/lib/media', () => ({ uploadToMediaLibrary }));

// Raw SQL calls are recorded as { sql, values }; reads are answered from `rows` by a matching snippet.
type Call = { sql: string; values: unknown[] };
const db = vi.hoisted(() => {
  const state = { rows: [] as { match: string; rows: any[] }[], executed: [] as { sql: string; values: unknown[] }[] };
  const text = (strings: TemplateStringsArray) => strings.join('?');
  return {
    state,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = text(strings);
      return state.rows.find((r) => sql.includes(r.match))?.rows ?? [];
    }),
    $executeRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const call = { sql: text(strings), values };
      state.executed.push(call);
      return Promise.resolve(1);
    }),
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
});
vi.mock('@udyaibase/database', async () => ({ prisma: db, Prisma: (await import('@prisma/client')).Prisma }));

const as = (role: string, id = 'u-writer') => mockSession.mockResolvedValue({ user: { id, role, name: 'Asha', email: 'asha@udyaibase.com' } });
const existingArticle = (o: Record<string, unknown> = {}) =>
  db.state.rows.unshift({ match: 'SELECT "authorId", status::text', rows: [{ authorId: 'u-writer', status: 'DRAFT', publishedAt: null, isFeatured: false, isPinned: false, isSponsored: false, ...o }] });
const articleWrite = (): Call => db.state.executed.find((c) => /INSERT INTO "Article"|UPDATE "Article" SET\s+title/.test(c.sql))!;
const valueAfter = (c: Call, column: string) => {
  // The value bound right after `column = ` (UPDATE) — enough to check what was written.
  const parts = c.sql.split('?');
  const i = parts.findIndex((p) => p.includes(column));
  return c.values[i];
};
const save = async (payload: Record<string, unknown>, id?: string) => {
  const { saveArticleAction } = await import('@/app/(dashboard)/articles/actions');
  return saveArticleAction({ title: 'Sarvam raises Series B', content: '<p>Body</p>', ...payload } as any, id);
};

beforeEach(() => {
  vi.clearAllMocks();
  db.state.rows = [];
  db.state.executed = [];
});

describe('article status changes', () => {
  it('nobody signed out can change an article, and writers cannot publish, archive or touch others’ work', async () => {
    const { updateArticleStatusAction } = await import('@/app/(dashboard)/articles/actions');
    mockSession.mockResolvedValue(null);
    expect((await updateArticleStatusAction('a1', 'ARCHIVED')).success).toBe(false);
    expect(db.$executeRaw).not.toHaveBeenCalled();

    db.state.rows.push({ match: 'SELECT title, "authorId"', rows: [{ title: 'T', authorId: 'u-writer', status: 'IN_REVIEW', scheduledAt: null }] });
    as('WRITER');
    expect((await updateArticleStatusAction('a1', 'PUBLISHED')).success).toBe(false);
    expect((await updateArticleStatusAction('a1', 'ARCHIVED')).success).toBe(false);
    as('WRITER', 'someone-else');
    expect((await updateArticleStatusAction('a1', 'DRAFT')).success).toBe(false);
    expect(db.$executeRaw).not.toHaveBeenCalled();

    as('WRITER');
    expect((await updateArticleStatusAction('a1', 'DRAFT')).success).toBe(true);
    expect((await updateArticleStatusAction('a1', 'NOT_A_STATUS')).success).toBe(false);
  });

  it('editors publish with a publish date (kept if it already had one) and every change is audited', async () => {
    const { updateArticleStatusAction } = await import('@/app/(dashboard)/articles/actions');
    db.state.rows.push({ match: 'SELECT title, "authorId"', rows: [{ title: 'T', authorId: 'u-writer', status: 'IN_REVIEW', scheduledAt: null }] });
    as('EDITOR_IN_CHIEF', 'u-editor');
    expect((await updateArticleStatusAction('a1', 'PUBLISHED')).success).toBe(true);
    expect(db.state.executed[0].sql).toContain('"publishedAt" = COALESCE("publishedAt", NOW())');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ before: { status: 'IN_REVIEW' }, after: { status: 'PUBLISHED' } }));
    expect(refreshPublic).toHaveBeenCalled();
    // Scheduling needs a time set in the editor.
    expect((await updateArticleStatusAction('a1', 'SCHEDULED')).success).toBe(false);
  });
});

describe('saving articles', () => {
  it('a writer pressing publish sends the article for review instead', async () => {
    as('WRITER');
    const r = await save({ status: 'PUBLISHED', isFeatured: true });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.status).toBe('IN_REVIEW');
    expect(r.notice).toMatch(/review/);
    const w = articleWrite();
    expect(w.sql).toContain('INSERT INTO "Article"');
    expect(w.values).toContain('IN_REVIEW');
    expect(w.values).not.toContain(true); // not featured, pinned or sponsored
  });

  it('writers can only edit their own articles, and not once they are live', async () => {
    as('WRITER', 'u-other');
    existingArticle();
    expect((await save({ status: 'DRAFT' }, 'a1')).success).toBe(false);
    as('WRITER');
    db.state.rows = [];
    existingArticle({ status: 'PUBLISHED', publishedAt: '2026-10-01T10:00:00Z' });
    const r = await save({ status: 'PUBLISHED' }, 'a1');
    expect(r.success).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('publishing sets the publish date once; republishing keeps the original date', async () => {
    as('EDITOR_IN_CHIEF', 'u-editor');
    const first = await save({ status: 'PUBLISHED' });
    expect(first.success && first.data.publishedAt).toBeTruthy();

    db.state.executed = [];
    existingArticle({ status: 'PUBLISHED', publishedAt: '2026-10-01T10:00:00Z' });
    const again = await save({ status: 'PUBLISHED', title: 'Updated title' }, 'a1');
    expect(again.success && again.data.publishedAt).toBe('2026-10-01T10:00:00.000Z');
    expect(valueAfter(articleWrite(), '"publishedAt" =')).toEqual(new Date('2026-10-01T10:00:00Z'));
  });

  it('scheduling needs a future time', async () => {
    as('SUPER_ADMIN', 'u-admin');
    expect((await save({ status: 'SCHEDULED', scheduledAt: new Date(Date.now() - 60_000).toISOString() })).success).toBe(false);
    const r = await save({ status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(r.success && r.data.status).toBe('SCHEDULED');
  });

  it('stored HTML is cleaned (scripts and event handlers removed, tags and link settings kept) and read time is set', async () => {
    as('WRITER');
    await save({
      content: '<p onclick="x()">Hi <img src="x" onerror="alert(1)"><script>alert(1)</script>'
        + '<a href="/startups/sarvam-ai" class="mention" data-mention-type="startup" data-mention-id="s1" contenteditable="false">Sarvam AI</a> '
        + '<a href="javascript:alert(1)">bad</a> <a href="https://x.in" class="link-underline evil">ok</a></p>',
    });
    const content = JSON.parse(articleWrite().values.find((v) => typeof v === 'string' && v.startsWith('{"html"')) as string).html;
    expect(content).not.toMatch(/onclick|onerror|<script|javascript:|evil/);
    expect(content).toContain('class="mention" data-mention-type="startup" data-mention-id="s1" contenteditable="false"');
    expect(content).toContain('class="link-underline"');
    expect(articleWrite().values).toContain(1); // read time in minutes
  });

  it('slugs are cleaned and made unique', async () => {
    as('WRITER');
    db.state.rows.push({ match: 'SELECT slug FROM "Article"', rows: [{ slug: 'sarvam-raises-series-b' }, { slug: 'sarvam-raises-series-b-1' }] });
    const r = await save({ slug: '  Sarvam Raises SERIES B!! ' });
    expect(r.success && r.data.slug).toBe('sarvam-raises-series-b-2');
  });

  it('tags are written in the same transaction as the article, deduplicated', async () => {
    as('WRITER');
    await save({ tags: 'AI, ai , LLM,, India' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const tagInsert = db.state.executed.find((c) => c.sql.includes('INSERT INTO "Tag"'))!;
    expect(tagInsert).toBeTruthy();
    const link = db.state.executed.find((c) => c.sql.includes('INSERT INTO "ArticleTag"'))!;
    expect(link.values[1]).toEqual(['ai', 'llm', 'india']);
  });

  it('autosaving a draft writes no audit entry and does not refresh the website', async () => {
    as('WRITER');
    existingArticle();
    expect((await save({ status: 'DRAFT', autosave: true }, 'a1')).success).toBe(true);
    expect(audit).not.toHaveBeenCalled();
    expect(refreshPublic).not.toHaveBeenCalled();
  });

  it('editing a live article refreshes the website; a draft save does not', async () => {
    as('EDITOR_IN_CHIEF', 'u-editor');
    existingArticle({ status: 'PUBLISHED', publishedAt: '2026-10-01T10:00:00Z' });
    await save({ status: 'PUBLISHED' }, 'a1');
    expect(refreshPublic).toHaveBeenCalledTimes(1);
    db.state.rows = [];
    existingArticle();
    await save({ status: 'DRAFT' }, 'a1');
    expect(refreshPublic).toHaveBeenCalledTimes(1);
  });

  it('opening an older-format article gives the editor its text as HTML', async () => {
    const { getArticleByIdAction } = await import('@/app/(dashboard)/articles/actions');
    as('EDITOR_IN_CHIEF', 'u-editor');
    db.state.rows.push({ match: 'a.id, a.title, a.slug', rows: [{
      id: 'a1', title: 'Old', status: 'PUBLISHED', authorId: 'u-writer',
      content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ text: 'Why <now>' }] }, { type: 'paragraph', content: [{ text: 'Funding grew 4x.' }] }] },
    }] });
    const r = await getArticleByIdAction('a1');
    expect(r.success && r.data.html).toBe('<h2>Why &lt;now&gt;</h2><p>Funding grew 4x.</p>');
    expect(r.success && r.data.canEdit).toBe(true);
  });
});

describe('article image uploads', () => {
  const file = (bytes: number[], type: string, name: string) => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([...bytes, ...new Array(32).fill(0)])], name, { type }));
    return fd;
  };

  it('accepts real images only: no SVG, and the bytes must match the claimed type', async () => {
    const { uploadMediaAction } = await import('@/app/(dashboard)/articles/actions');
    as('WRITER');
    uploadToMediaLibrary.mockResolvedValue({ url: 'https://media.udyaibase.com/uploads/x.png', key: 'uploads/x.png', originalName: 'x.png' });
    expect((await uploadMediaAction(file([0x3c, 0x73, 0x76, 0x67], 'image/svg+xml', 'x.svg'))).success).toBe(false);
    expect((await uploadMediaAction(file([0xff, 0xd8, 0xff], 'image/png', 'x.png'))).success).toBe(false);
    expect(uploadToMediaLibrary).not.toHaveBeenCalled();
    const ok = await uploadMediaAction(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png', 'x.png'));
    expect(ok.success).toBe(true);
  });
});
