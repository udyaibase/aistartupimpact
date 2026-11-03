import { describe, it, expect, vi, beforeEach } from 'vitest';

const sql = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => [] as { id: string }[]));
type AuthResult = { session: { user: { role: string } } | null; error: string | null };
const auth = vi.hoisted(() => ({ requireActionAuth: vi.fn(async (..._roles: unknown[]): Promise<AuthResult> => ({ session: { user: { role: 'SUPER_ADMIN' } }, error: null })) }));
const audit = vi.hoisted(() => ({ logAuditEvent: vi.fn(), canDelete: vi.fn(async (): Promise<{ allowed: boolean; error?: string }> => ({ allowed: true })) }));
const refresh = vi.hoisted(() => ({ refreshPublic: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => sql }));
vi.mock('@/lib/api-auth', () => auth);
vi.mock('@/lib/audit-log', () => audit);
vi.mock('@/lib/refresh-public', () => refresh);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/locations', () => ({ checkLocation: vi.fn(async () => ({ ok: true, city: null, state: null, country: null })) }));

import { bulkJobAction } from '@/app/(dashboard)/jobs-board/actions';

const queryText = () => (sql.mock.calls.at(-1)![0] as unknown as string[]).join('?');

describe('bulk job actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireActionAuth.mockResolvedValue({ session: { user: { role: 'SUPER_ADMIN' } }, error: null });
    audit.canDelete.mockResolvedValue({ allowed: true });
  });

  it('rejects unknown actions, empty and oversized selections without touching the database', async () => {
    expect((await bulkJobAction(['a'], 'nuke' as never)).success).toBe(false);
    expect((await bulkJobAction([], 'pause')).success).toBe(false);
    expect((await bulkJobAction(Array.from({ length: 501 }, (_, i) => `j${i}`), 'pause')).success).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it('delete is Super Admin only (and needs delete permission)', async () => {
    auth.requireActionAuth.mockResolvedValueOnce({ session: null, error: 'Unauthorized' });
    expect(await bulkJobAction(['a'], 'delete')).toMatchObject({ success: false });
    expect(auth.requireActionAuth).toHaveBeenLastCalledWith(['SUPER_ADMIN']);
    audit.canDelete.mockResolvedValueOnce({ allowed: false, error: 'No delete permission' });
    expect(await bulkJobAction(['a'], 'delete')).toMatchObject({ success: false, error: 'No delete permission' });
    expect(sql).not.toHaveBeenCalled();
  });

  it('reports what changed, logs it and refreshes the public jobs page', async () => {
    sql.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    const r = await bulkJobAction(['a', 'b', 'b', 'c'], 'close');
    expect(r).toEqual({ success: true, changed: 2, skipped: 1 });
    expect(queryText()).toMatch(/status = 'CLOSED'[\s\S]*"closeReason" = 'MANUAL'/);
    expect(audit.logAuditEvent.mock.calls[0][0]).toMatchObject({ action: 'UPDATE', resourceType: 'JOB_LISTING', after: { bulkAction: 'close', changed: 2 } });
    expect(refresh.refreshPublic).toHaveBeenCalledWith(['jobs', 'home']);
  });

  it('opening keeps jobs on review hold hidden and gives expired jobs 30 more days', async () => {
    sql.mockResolvedValueOnce([{ id: 'a' }]);
    await bulkJobAction(['a'], 'open');
    const q = queryText();
    expect(q).toContain('"isActive" = NOT "moderationHold"');
    expect(q).toMatch(/"expiresAt" <= NOW\(\) THEN NOW\(\) \+ INTERVAL '30 days'/);
    expect(q).toContain('COALESCE("publishedAt", NOW())');
  });

  it('does not refresh the site when nothing changed', async () => {
    sql.mockResolvedValueOnce([]);
    expect(await bulkJobAction(['a'], 'unfeature')).toEqual({ success: true, changed: 0, skipped: 1 });
    expect(refresh.refreshPublic).not.toHaveBeenCalled();
  });
});
