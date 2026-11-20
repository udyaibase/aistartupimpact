import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mockSession = vi.fn();
const mockJobPipeline = vi.fn();

vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: () => mockSession() }));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@/lib/employer/pipeline-templates', () => ({
  jobPipeline: (...a: unknown[]) => mockJobPipeline(...a),
  listTemplates: vi.fn(() => Promise.resolve([{ key: 'FOUNDER_LED' }])),
  updateJobPipeline: vi.fn(),
}));
vi.mock('@/lib/employer/owners', () => ({ isRealInbox: () => true }));
vi.mock('@udyaibase/database', () => ({
  prisma: {
    jobBoardTeamMember: { findMany: vi.fn(() => Promise.resolve([{ email: 'owner@acme.test', name: 'Owner', role: 'OWNER' }])) },
    jobBoardEmployer: { findUnique: vi.fn(() => Promise.resolve({ email: 'owner@acme.test' })) },
  },
}));

const JOB = { id: 'job-a', title: 'Engineer', template: 'FOUNDER_LED', version: 1, config: { rounds: ['Interview'] }, decisionOwnerEmail: 'owner@acme.test', decisionDelegateEmail: null, recruitersSeeOffers: false };
const base = { id: 'emp-1', email: 'me@acme.test', companyName: 'Acme', slug: 'acme', plan: 'FREE', onboardingCompleted: true, memberId: 'm1', memberName: 'Me' };
const get = async (jobId: string) => {
  const { GET } = await import('@/app/api/employer/jobs/[id]/pipeline/route');
  return GET(new NextRequest(`http://localhost:3000/api/employer/jobs/${jobId}/pipeline`), { params: Promise.resolve({ id: jobId }) });
};

describe('GET /api/employer/jobs/[id]/pipeline: job scope', () => {
  beforeEach(() => {
    mockSession.mockReset();
    mockJobPipeline.mockReset();
    mockJobPipeline.mockResolvedValue(JOB);
  });

  it('an interviewer limited to other jobs gets "not found" and the job is never read', async () => {
    mockSession.mockResolvedValue({ ...base, role: 'INTERVIEWER', jobIds: ['job-b'] });
    const res = await get('job-a');
    expect(res.status).toBe(404);
    expect(mockJobPipeline).not.toHaveBeenCalled();
  });

  it('an interviewer on the job sees its steps but no teammate emails or decision owner', async () => {
    mockSession.mockResolvedValue({ ...base, role: 'INTERVIEWER', jobIds: ['job-a'] });
    const res = await get('job-a');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.config.rounds).toEqual(['Interview']);
    expect(body.job.decisionOwnerEmail).toBeNull();
    expect(body.people).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('owner@acme.test');
  });

  it('a recruiter still gets the full settings', async () => {
    mockSession.mockResolvedValue({ ...base, role: 'RECRUITER', jobIds: null });
    const body = await (await get('job-a')).json();
    expect(body.job.decisionOwnerEmail).toBe('owner@acme.test');
    expect(body.people.length).toBeGreaterThan(0);
  });
});

describe('password reactivation', () => {
  it('the route is gone: a deactivated workspace returns only through code sign-in', () => {
    expect(existsSync(resolve(__dirname, '../../app/api/employer/reactivate/route.ts'))).toBe(false);
  });
});
