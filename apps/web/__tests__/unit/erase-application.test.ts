import { describe, it, expect, vi } from 'vitest';

const del = (name: string) => vi.fn(async (args: unknown) => ({ op: name, args }));
const db = vi.hoisted(() => ({} as any));
vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: { DbNull: null } }));
vi.mock('@/lib/jobs/resume-storage', () => ({ deleteResume: vi.fn(async () => undefined) }));

import { eraseApplication } from '@/lib/jobs/candidate-status';
import { deleteResume } from '@/lib/jobs/resume-storage';

describe('DPDP erasure', () => {
  it('deletes the resume file and every derived copy of it, including the structured resume profile', async () => {
    Object.assign(db, {
      jobBoardResumeUpload: { findMany: vi.fn(async () => [{ id: 'u1', key: 'k-upload' }]), updateMany: del('upload.detach'), deleteMany: del('upload.delete') },
      jobBoardApplication: { findUnique: vi.fn(async () => ({ resumeKey: 'k-app' })), update: del('app.anonymise') },
      jobBoardApplicationNote: { deleteMany: del('notes') },
      jobBoardAiScreening: { deleteMany: del('aiScreening') },
      jobBoardResumeProfile: { deleteMany: del('resumeProfile') },
      jobBoardShortlistVote: { deleteMany: del('votes') },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    });
    await eraseApplication('a1');
    expect(deleteResume).toHaveBeenCalledWith('k-app');
    expect(deleteResume).toHaveBeenCalledWith('k-upload');
    expect(db.jobBoardResumeProfile.deleteMany).toHaveBeenCalledWith({ where: { applicationId: 'a1' } });
    expect(db.jobBoardAiScreening.deleteMany).toHaveBeenCalledWith({ where: { applicationId: 'a1' } });
  });
});
