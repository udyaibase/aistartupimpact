import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  jobBoardListing: { findFirst: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'list2' })) },
  jobBoardApplication: { findFirst: vi.fn(async (..._a: any[]): Promise<any> => null) },
  jobBoardResumeUpload: { create: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'up2' })) },
  webUser: { findUnique: vi.fn(async (..._a: any[]): Promise<any> => ({ emailVerifiedAt: new Date() })) },
}));
const store = vi.hoisted(() => ({ read: vi.fn(async (..._a: any[]): Promise<any> => null), put: vi.fn(async (..._a: any[]) => undefined) }));
const session = vi.hoisted(() => ({ user: null as any, captcha: true }));
const PDF = new TextEncoder().encode('%PDF-1.4 test resume');

vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: {} }));
vi.mock('@/lib/user-session', () => ({ getUserSession: async () => session.user }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: async () => session.captcha }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => 'ip' }));
vi.mock('@/lib/event-rate-limit', () => ({ resumeUploadRateLimit: {} }));
vi.mock('@/lib/jobs/public', () => ({ applyableListingWhere: () => ({}) }));
vi.mock('@/lib/jobs/apply-session', () => ({ hashIp: () => 'iphash', signApplySession: (u: string, l: string) => `tok:${u}:${l}` }));
vi.mock('@/lib/jobs/resume-storage', () => ({ resumeStorageReady: () => true, readResume: store.read, putResume: store.put }));
vi.mock('@/lib/jobs/resume-text', () => ({ sniffResume: (b: Uint8Array) => (b.length ? { ext: 'pdf', mime: 'application/pdf' } : null) }));

import { POST } from '@/app/api/jobs/apply/reuse/route';

const post = () => POST(new NextRequest('http://localhost/api/jobs/apply/reuse', { method: 'POST', body: JSON.stringify({ slug: 'ml-engineer', turnstileToken: 't' }) }));
const last = { resumeKey: 'resumes/list1/old.pdf', appliedAt: new Date('2026-11-19T06:00:00Z'), Listing: { title: 'Data Engineer' } };

beforeEach(() => { vi.clearAllMocks(); session.user = { id: 'u1', email: 'kavya@x.co', name: 'Kavya' }; session.captcha = true; });

describe('use my last resume', () => {
  it('needs the security check and a signed-in job seeker', async () => {
    session.captcha = false;
    expect((await post()).status).toBe(400);
    session.captcha = true; session.user = null;
    expect((await post()).status).toBe(401);
    expect(store.put).not.toHaveBeenCalled();
  });
  it('only looks at their own applications that still have a resume', async () => {
    expect((await post()).status).toBe(410); // nothing on file
    const where = db.jobBoardApplication.findFirst.mock.calls[0][0].where;
    expect(where.webUserId).toBe('u1');
    expect(where.resumeKey).toEqual({ not: null });
  });
  it('copies the file to a new key for this job, so each application keeps its own copy', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(last);
    store.read.mockResolvedValueOnce(PDF);
    const res = await post();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(store.read).toHaveBeenCalledWith('resumes/list1/old.pdf');
    const [newKey, bytes] = store.put.mock.calls[0];
    expect(newKey).toMatch(/^resumes\/list2\/[0-9a-f-]+\.pdf$/);
    expect(newKey).not.toBe(last.resumeKey);
    expect(bytes).toBe(PDF);
    expect(db.jobBoardResumeUpload.create.mock.calls[0][0].data).toMatchObject({ key: newKey, listingId: 'list2' });
    expect(data.token).toBe('tok:up2:list2');
    expect(data.file.name).toBe('Resume from your Data Engineer application, 19 Nov');
  });
  it('asks for a fresh upload when the stored file is gone', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(last);
    store.read.mockRejectedValueOnce(new Error('NoSuchKey'));
    const res = await post();
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe('gone');
    expect(store.put).not.toHaveBeenCalled();
  });
});
