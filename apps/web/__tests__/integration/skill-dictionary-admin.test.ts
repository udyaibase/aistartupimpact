import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  skillDictionarySkill: { findMany: vi.fn(async (): Promise<any[]> => []) },
  skillDictionaryAlias: { findMany: vi.fn(async (): Promise<any[]> => []) },
  skillDictionaryRule: { findMany: vi.fn(async (): Promise<any[]> => []) },
  skillDictionaryMeta: { findUnique: vi.fn(async (): Promise<any> => ({ version: 3, rescoredVersion: 2, updatedAt: new Date() })), update: vi.fn() },
  skillDictionaryUnknown: { upsert: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []), update: vi.fn() },
  jobBoardAiScreening: { findMany: vi.fn(async (): Promise<any[]> => []), update: vi.fn() },
}));
const ai = vi.hoisted(() => ({ openaiChat: vi.fn(), modelOptions: () => ({ temperature: 0 }) }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/ops/ai', () => ai);

import { ensureSkillOverrides, recordUnknownSkills, skillTags } from '@/lib/jobs/skill-overrides';
import { runSkillSuggestions } from '@/lib/jobs/skill-suggestions';
import { rescoreReviews } from '@/lib/jobs/skill-rescore';
import { normalizeSkill, setSkillOverrides } from '@/lib/jobs/skills';

beforeEach(() => { vi.clearAllMocks(); setSkillOverrides({}); process.env.OPENAI_API_KEY = 'test'; });

describe('unknown skills capture', () => {
  it('splits skills lists without breaking CI/CD or A/B Testing', () => {
    expect(skillTags('Skills: Python, CI/CD | A/B Testing • K8s; Data Engineer. Turborepo')).toEqual(['Python', 'CI/CD', 'A/B Testing', 'K8s', 'Data Engineer', 'Turborepo']);
  });

  it('records only plausible tags the dictionary doesn’t know; never identity, links or sentences', async () => {
    await ensureSkillOverrides(true);
    await recordUnknownSkills(['Python, Turborepo, shadcn/ui', '[email] | [phone]', 'https://x.dev', 'Led a team of four engineers across two cities in India'], 'resume');
    const keys = db.skillDictionaryUnknown.upsert.mock.calls.map((c: any) => c[0].where.key);
    expect(keys).toEqual(['turborepo', 'shadcnui']);
  });
});

describe('weekly AI suggestions', () => {
  it('stores usable suggestions only: an alias must point at a real skill', async () => {
    db.skillDictionaryUnknown.findMany.mockResolvedValueOnce([{ key: 'turborepo', sample: 'Turborepo', seenCount: 9 }, { key: 'reactjsx', sample: 'ReactJSX', seenCount: 4 }, { key: 'kubernets', sample: 'Kubernets', seenCount: 3 }]);
    ai.openaiChat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ items: [
      { key: 'turborepo', action: 'new', skill: 'Turborepo', category: 'tools', reason: 'Monorepo build tool' },
      { key: 'reactjsx', action: 'alias', skill: 'Reactish', category: '', reason: 'made-up target' },
      { key: 'kubernets', action: 'alias', skill: 'Kubernetes', category: '', reason: 'Typo' },
    ] }) } }] });
    expect(await runSkillSuggestions()).toEqual({ suggested: 2 });
    const saved = db.skillDictionaryUnknown.update.mock.calls.map((c: any) => [c[0].where.key, c[0].data.suggestion.action, c[0].data.suggestion.skill]);
    expect(saved).toEqual([['turborepo', 'new', 'Turborepo'], ['kubernets', 'alias', 'Kubernetes']]);
    // Only short skill tags are sent, nothing else.
    expect(ai.openaiChat.mock.calls[0]![1].messages[1].content).toContain('turborepo: "Turborepo" (9)');
  });
});

describe('approved additions apply on the server', () => {
  it('loads aliases, new skills and rules from the database', async () => {
    db.skillDictionaryAlias.findMany.mockResolvedValueOnce([{ aliasKey: 'kubernets', skillKey: 'kubernetes' }]);
    await ensureSkillOverrides(true);
    expect(normalizeSkill('Kubernets')).toBe('kubernetes');
  });
});

describe('re-scoring after a dictionary change (code only, no AI)', () => {
  it('recomputes stored v3 reviews from their saved evidence and records the version; old reviews are left alone', async () => {
    const profile = {
      lines: ['ML Engineer, Acme', 'Jan 2022 - Present', 'Built Kubernets clusters for model serving'],
      extract: { pageCount: 1, pagesRead: 1, lowTextPages: [], twoColumnPages: [], format: 'pdf' }, sections: [], projects: [], education: [], certifications: [], skillLines: [],
      roles: [{ title: 'ML Engineer', company: 'Acme', dateText: 'Jan 2022 - Present', range: { start: { y: 2022, m: 1 }, end: 'present' }, months: 59, internship: false, headerLines: [1, 2], bulletLines: [3] }],
      quality: { readable: true, scannedPages: 0, unplacedShare: 0 }, experience: { months: 59, internMonths: 0, years: 4.9, datedRoles: 1, roles: 1, gaps: [] },
    };
    const listing = { title: 'MLE', description: '', skills: ['Kubernetes'], mustHaveSkills: ['Kubernetes'], experienceMin: null, experienceMax: null, workType: 'REMOTE', city: null, salaryMax: null, salaryCurrency: null, maxNoticeDays: null, screeningQuestions: [] };
    const app = { confirmedSkills: [], experienceYears: null, city: null, noticePeriodDays: null, expectedCtcLakh: null, screeningAnswers: [], ResumeProfile: { data: profile }, Listing: listing };
    db.jobBoardAiScreening.findMany.mockResolvedValueOnce([
      { id: 's1', result: { v: 3, tier: 'advanced', modelEvidence: { requirements: [], roles: [{ index: 1, relevance: 'same' }], summary: '', questions: [] } }, Application: app },
      { id: 's2', result: { summary: 'old v2 review' }, Application: app },
    ]);
    db.skillDictionaryAlias.findMany.mockResolvedValue([{ aliasKey: 'kubernets', skillKey: 'kubernetes' }]);
    const r = await rescoreReviews({ now: new Date('2026-11-23') });
    expect(r).toMatchObject({ version: 3, rescored: 1, done: true });
    const upd = db.jobBoardAiScreening.update.mock.calls[0]![0] as any;
    expect(upd.where.id).toBe('s1');
    expect(upd.data.result.dictVersion).toBe(3);
    expect(upd.data.result.requirements[0]).toMatchObject({ name: 'Kubernetes', level: 'used' }); // the new alias found it
    expect(upd.data.result.tier).toBe('advanced');
    expect(db.skillDictionaryMeta.update).toHaveBeenCalledWith({ where: { id: 'main' }, data: { rescoredVersion: 3 } });
    expect(ai.openaiChat).not.toHaveBeenCalled();
    db.skillDictionaryAlias.findMany.mockResolvedValue([]);
  });

  it('nothing to do when the version hasn’t moved', async () => {
    db.skillDictionaryMeta.findUnique.mockResolvedValueOnce({ version: 3, rescoredVersion: 3, updatedAt: new Date() });
    expect(await rescoreReviews()).toEqual({ version: 3, rescored: 0, done: true });
    expect(db.jobBoardAiScreening.findMany).not.toHaveBeenCalled();
  });
});
