import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardListing: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []), create: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'newjob' })), update: vi.fn(), updateMany: vi.fn() },
  jobBoardImport: { create: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'imp1' })), findFirst: vi.fn(), update: vi.fn(async (a: any) => ({ created: a.data.created?.increment ?? 0, skipped: a.data.skipped?.increment ?? 0 })) },
  jobBoardApplication: {
    findMany: vi.fn(async (..._a: any[]): Promise<any> => []), createManyAndReturn: vi.fn(async (a: any) => a.data.map((d: any, i: number) => ({ id: `a${i}`, listingId: d.listingId, email: d.email }))),
    deleteMany: vi.fn(), groupBy: vi.fn(async (..._a: any[]): Promise<any> => []), update: vi.fn(),
  },
  jobBoardApplicationNote: { createMany: vi.fn() },
}));
const storage = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn(async () => undefined) }));

vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: { DbNull: 'DbNull' } }));
vi.mock('@/lib/jobs/slug', () => ({ uniqueJobSlug: async (t: string) => t.toLowerCase().replace(/\s+/g, '-') }));
vi.mock('@/lib/jobs/resume-storage', () => ({ putResume: storage.put, deleteResume: storage.del, resumeStorageReady: () => true }));

import { runImportChunk, startImport, undoImport } from '@/lib/employer/importer';

beforeEach(() => vi.clearAllMocks());
const now = new Date('2026-11-18T06:00:00Z');
const csv = 'Name,Email,Job,Stage,Notes\nAsha,asha@x.co,ML Engineer,Interview,strong\nRavi,ravi@x.co,Old Role,Rejected,\nNo Mail,,ML Engineer,,\n';

describe('starting an import', () => {
  it('checks the jobs belong to this workspace', async () => {
    db.jobBoardListing.findMany.mockResolvedValueOnce([]);
    const r = await startImport({ employerId: 'emp1', actorEmail: 'hr@acme.co', now, input: { csv, mapping: { fullName: 0, email: 1, job: 2, stage: 3 }, jobs: { 'ML Engineer': { kind: 'existing', listingId: 'other-company-job' } } } });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(db.jobBoardImport.create).not.toHaveBeenCalled();
  });

  it('needs an email column', async () => {
    expect(await startImport({ employerId: 'emp1', actorEmail: 'hr@acme.co', now, input: { csv, mapping: { fullName: 0 } } })).toMatchObject({ ok: false });
  });

  it('stores clean rows, makes a closed private job for old roles, and records problems', async () => {
    db.jobBoardListing.findMany.mockResolvedValueOnce([{ id: 'j1' }]);
    const r = await startImport({
      employerId: 'emp1', actorEmail: 'hr@acme.co', now,
      input: { fileName: 'export.csv', csv, mapping: { fullName: 0, email: 1, job: 2, stage: 3, notes: 4 }, jobs: { 'ML Engineer': { kind: 'existing', listingId: 'j1' }, 'Old Role': { kind: 'new' } }, stages: { Interview: 'INTERVIEW', Rejected: 'REJECTED' } },
    });
    expect(r).toEqual({ ok: true, id: 'imp1', total: 2, problems: 1 });
    expect(db.jobBoardListing.create.mock.calls[0][0].data).toMatchObject({ title: 'Old Role', status: 'CLOSED', showOnJobsPage: false, showOnCareers: false, showOnProfile: false });
    const data = db.jobBoardImport.create.mock.calls[0][0].data;
    expect(data.rows.map((x: any) => [x.email, x.listingId, x.stage])).toEqual([['asha@x.co', 'j1', 'INTERVIEW'], ['ravi@x.co', 'newjob', 'REJECTED']]);
    expect(data.mapping.createdJobIds).toEqual(['newjob']);
  });
});

describe('running an import', () => {
  const imp = (over: Record<string, unknown> = {}) => ({
    id: 'imp1', employerId: 'emp1', status: 'RUNNING', cursor: 0, createdBy: 'hr@acme.co', fileName: 'export.csv', problems: [],
    rows: [
      { row: 2, email: 'asha@x.co', fullName: 'Asha', listingId: 'j1', stage: 'INTERVIEW', appliedAt: '2026-03-01T06:30:00.000Z', notes: 'strong' },
      { row: 3, email: 'ravi@x.co', fullName: 'Ravi', listingId: 'j1', stage: 'APPLIED', appliedAt: null, notes: null },
    ], ...over,
  });

  it('creates candidates as Imported (no emails), keeps notes, leaves existing candidates alone, and clears the rows when done', async () => {
    db.jobBoardImport.findFirst.mockResolvedValueOnce(imp());
    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ listingId: 'j1', email: 'Ravi@x.co' }]);
    const r = await runImportChunk('imp1', 'emp1', now);
    expect(r).toMatchObject({ ok: true, done: true, created: 1, skipped: 1 });
    const created = db.jobBoardApplication.createManyAndReturn.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ email: 'asha@x.co', source: 'IMPORTED', importId: 'imp1', status: 'INTERVIEW', appliedAt: new Date('2026-03-01T06:30:00.000Z') });
    expect(created[0].talentPoolUntil).toBeUndefined();
    expect(db.jobBoardApplicationNote.createMany.mock.calls[0][0].data[0]).toMatchObject({ applicationId: 'a0', body: 'strong' });
    const upd = db.jobBoardImport.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ status: 'DONE', rows: 'DbNull', cursor: 2 });
    expect(upd.problems[0]).toMatchObject({ email: 'ravi@x.co', reason: 'Already a candidate for this job (left as is)' });
  });

  it('another workspace can’t run it', async () => {
    db.jobBoardImport.findFirst.mockResolvedValueOnce(null);
    expect(await runImportChunk('imp1', 'emp2', now)).toMatchObject({ ok: false, status: 404 });
    expect(db.jobBoardImport.findFirst.mock.calls[0][0].where).toEqual({ id: 'imp1', employerId: 'emp2' });
  });
});

describe('undo', () => {
  it('removes the candidates, their resumes and empty jobs it created, within 7 days', async () => {
    db.jobBoardImport.findFirst.mockResolvedValueOnce({ id: 'imp1', status: 'DONE', finishedAt: new Date(now.getTime() - 2 * 864e5), mapping: { createdJobIds: ['newjob', 'used'] } });
    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ id: 'a1', listingId: 'j1', resumeKey: 'resumes/j1/x.pdf' }, { id: 'a2', listingId: 'newjob', resumeKey: null }]);
    db.jobBoardApplication.groupBy.mockResolvedValueOnce([{ listingId: 'used' }]);
    expect(await undoImport('imp1', 'emp1', now)).toEqual({ ok: true, removed: 2 });
    expect(storage.del).toHaveBeenCalledWith('resumes/j1/x.pdf');
    expect(db.jobBoardApplication.deleteMany).toHaveBeenCalledWith({ where: { importId: 'imp1' } });
    expect(db.jobBoardListing.updateMany.mock.calls.at(-1)![0]).toMatchObject({ where: { id: { in: ['newjob'] } }, data: { deletedAt: now } });
  });

  it('not after 7 days, and not twice', async () => {
    db.jobBoardImport.findFirst.mockResolvedValueOnce({ id: 'imp1', status: 'DONE', finishedAt: new Date(now.getTime() - 8 * 864e5), mapping: {} });
    expect(await undoImport('imp1', 'emp1', now)).toMatchObject({ ok: false, status: 409 });
    db.jobBoardImport.findFirst.mockResolvedValueOnce({ id: 'imp1', status: 'UNDONE', mapping: {} });
    expect(await undoImport('imp1', 'emp1', now)).toMatchObject({ ok: false, status: 409 });
    expect(db.jobBoardApplication.deleteMany).not.toHaveBeenCalled();
  });
});
