import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardApplication: { findFirst: vi.fn() },
  jobBoardAiScreening: { create: vi.fn(async () => ({ id: 's1' })), update: vi.fn(async () => ({})), delete: vi.fn() },
}));
const ai = vi.hoisted(() => ({ openaiChat: vi.fn(), modelOptions: () => ({ temperature: 0 }) }));
const prof = vi.hoisted(() => ({ getResumeProfile: vi.fn() }));
const files = vi.hoisted(() => ({ readResume: vi.fn() }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/ops/ai', () => ai);
vi.mock('@/lib/jobs/resume-profile', () => prof);
vi.mock('@/lib/jobs/resume-storage', () => files);
vi.mock('@/lib/employer/ai-usage', () => ({ recordAiRerun: vi.fn(async () => true) }));
const plan = vi.hoisted(() => ({ key: 'GROWTH', tier: 'advanced' }));
vi.mock('@/lib/employer/billing', () => ({
  planStatus: vi.fn(async () => ({ plan: { key: plan.key, aiScreensPerPeriod: 100, aiReviewTier: plan.tier }, phase: 'active', aiAutoScreen: true, ai: { left: 10, limit: 100 }, aiPeriodStart: new Date() })),
}));

process.env.OPENAI_API_KEY = 'test';
import { screenApplication } from '@/lib/jobs/ai-screen';

const app = {
  id: 'a1', fullName: 'Asha Verma', resumeKey: 'k1', withdrawnAt: null, coverLetter: null, screeningAnswers: [],
  currentTitle: 'ML Engineer', currentCompany: null, experienceYears: 9, city: 'Pune', noticePeriodDays: 30, confirmedSkills: ['Python'],
  AiScreening: null,
  Listing: { id: 'L1', employerId: 'e1', title: 'ML Engineer', description: '<p>Build search</p>', skills: ['Python', 'PyTorch'], mustHaveSkills: ['PyTorch'], experienceBand: null, experienceMin: 3, experienceMax: 6, workType: 'REMOTE', city: null, screeningQuestions: [] },
};
const profile = {
  lines: ['[name] [name]', 'ML Engineer, Acme AI', 'Jan 2022 - Present', 'Built RAG search with PyTorch over 2M documents'],
  extract: { pageCount: 1, pagesRead: 1, lowTextPages: [], twoColumnPages: [], format: 'pdf' },
  sections: [], projects: [], education: [], certifications: [], skillLines: [],
  roles: [{ title: 'ML Engineer', company: 'Acme AI', dateText: 'Jan 2022 - Present', range: { start: { y: 2022, m: 1 }, end: 'present' }, months: 59, internship: false, headerLines: [2, 3], bulletLines: [4] }],
  quality: { readable: true, scannedPages: 0, unplacedShare: 0 },
  experience: { months: 59, internMonths: 3, years: 4.9, datedRoles: 1, roles: 1, gaps: [{ from: { y: 2020, m: 1 }, to: { y: 2021, m: 12 }, months: 24 }] },
};
const v3Reply = { choices: [{ message: { content: JSON.stringify({ requirements: [{ id: 'R1', lines: [4], strength: 'direct' }], roles: [{ index: 1, relevance: 'same' }], summary: 'Builds search in PyTorch.', questions: ['q'] }) } }] };
const modelReply = { choices: [{ message: { content: JSON.stringify({ summary: 'ok', strengths: [], gaps: [], skills: [], experience: { level: 'none', evidence: '' }, questions: [] }) } }] };

beforeEach(() => {
  vi.clearAllMocks();
  db.jobBoardApplication.findFirst.mockResolvedValue(app);
  ai.openaiChat.mockResolvedValue(modelReply);
});

const prompt = () => ai.openaiChat.mock.calls[0]![1].messages[1].content as string;

describe('AI review uses the structured profile', () => {
  it('a readable profile is reviewed line by line and scored by code; no gaps, no identity in the prompt', async () => {
    prof.getResumeProfile.mockResolvedValueOnce({ profile, status: 'built' });
    ai.openaiChat.mockResolvedValueOnce(v3Reply);
    expect(await screenApplication('a1', 'e1')).toEqual({ ok: true, status: 'done' });
    const p = prompt();
    expect(p.startsWith('<job>')).toBe(true);
    expect(p).toContain('R1: PyTorch (must-have)');
    expect(p).toContain('L4: Built RAG search with PyTorch over 2M documents');
    expect(p).not.toMatch(/gap|2020|2021/i);
    expect(p).not.toMatch(/Asha|Verma/);
    expect(files.readResume).not.toHaveBeenCalled();
    const saved = (db.jobBoardAiScreening.update.mock.calls[0] as any)[0].data;
    expect(saved.promptVersion).toMatch(/^screen-v3/);
    expect(saved.result.v).toBe(3);
    expect(saved.result.requirements[0]).toMatchObject({ name: 'PyTorch', level: 'used', evidence: [{ line: 4, text: 'Built RAG search with PyTorch over 2M documents' }] });
    expect(saved.fitScore).toBe(Math.round(saved.result.breakdown.reduce((n: number, b: any) => n + b.earned, 0)));
  });

  it('a scanned resume (profile not readable) reviews the form only', async () => {
    prof.getResumeProfile.mockResolvedValueOnce({ profile: { ...profile, quality: { readable: false, scannedPages: 2, unplacedShare: 1 } }, status: 'built' });
    await screenApplication('a1', 'e1');
    expect(prompt()).toContain('(No resume text available. Review the form only and say so in the summary.)');
  });

  it('falls back to reading the file the old way when no profile could be built', async () => {
    prof.getResumeProfile.mockResolvedValueOnce({ profile: null, status: 'failed' });
    files.readResume.mockRejectedValueOnce(new Error('gone'));
    expect(await screenApplication('a1', 'e1')).toEqual({ ok: true, status: 'done' });
    expect(files.readResume).toHaveBeenCalledWith('k1');
    expect(prompt()).not.toContain("resume's dates");
  });
});

describe('the plan decides the review model', () => {
  it('every plan, Free included, gets the advanced model: candidates are judged the same whichever plan the employer is on', async () => {
    const { PLANS } = await import('@udyaibase/utils/employer-plans');
    expect(Object.values(PLANS).every((p) => p.aiReviewTier === 'advanced')).toBe(true);
    // The per-plan switch still works if a plan is ever set to standard.
    for (const [key, tier, model] of [['FREE', 'standard', 'gpt-4.1-mini'], ['GROWTH', 'advanced', 'gpt-4.1']] as const) {
      vi.clearAllMocks();
      db.jobBoardApplication.findFirst.mockResolvedValue(app);
      plan.key = key; plan.tier = tier;
      prof.getResumeProfile.mockResolvedValueOnce({ profile, status: 'built' });
      ai.openaiChat.mockResolvedValueOnce(v3Reply);
      await screenApplication('a1', 'e1');
      expect(ai.openaiChat.mock.calls[0]![1].model).toBe(model);
      const saved = (db.jobBoardAiScreening.update.mock.calls[0] as any)[0].data;
      expect(saved.model).toBe(model);
      expect(saved.result.tier).toBe(tier);
    }
    plan.key = 'GROWTH'; plan.tier = 'advanced';
  });
});


describe('automatic reviews are skipped when they would be wasted', () => {
  const koApp = { ...app, screeningAnswers: [{ id: 'k', answer: 'no' }], Listing: { ...app.Listing, screeningQuestions: [{ id: 'k', question: 'Office?', type: 'yesno', knockoutAnswer: 'yes' }] } };

  it('a failed knockout: no automatic review, nothing counted; a review run by hand still goes ahead', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValue(koApp);
    expect(await screenApplication('a1', 'e1', { auto: true })).toMatchObject({ ok: false, code: 'skipped' });
    expect(ai.openaiChat).not.toHaveBeenCalled();
    expect(db.jobBoardAiScreening.create).not.toHaveBeenCalled();
    prof.getResumeProfile.mockResolvedValueOnce({ profile, status: 'built' });
    ai.openaiChat.mockResolvedValueOnce(v3Reply);
    expect(await screenApplication('a1', 'e1')).toEqual({ ok: true, status: 'done' });
  });

  it('a scanned resume: no automatic review', async () => {
    prof.getResumeProfile.mockResolvedValueOnce({ profile: { ...profile, quality: { readable: false, scannedPages: 2, unplacedShare: 1 } }, status: 'built' });
    expect(await screenApplication('a1', 'e1', { auto: true })).toMatchObject({ ok: false, code: 'skipped' });
    expect(ai.openaiChat).not.toHaveBeenCalled();
    expect(db.jobBoardAiScreening.create).not.toHaveBeenCalled();
  });
});
