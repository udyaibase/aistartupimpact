import { describe, it, expect } from 'vitest';
import { computeMatch, type MatchJob, type MatchApplicant } from '@/lib/jobs/match';
import { matchSkills, normalizeSkill } from '@/lib/jobs/skills';
import { isListingPublic } from '@/lib/jobs/public';

const job: MatchJob = {
  skills: ['Node.js', 'PostgreSQL', 'Docker', 'AWS'], mustHaveSkills: ['Node.js', 'PostgreSQL'],
  experienceMin: 3, experienceMax: 5, workType: 'ONSITE', city: 'Bengaluru', salaryMax: 2_500_000_00, salaryCurrency: 'INR',
  maxNoticeDays: 30, screeningQuestions: [{ id: 'q1', question: 'Office?', type: 'yesno', knockoutAnswer: 'yes' }],
};
const ideal: MatchApplicant = {
  confirmedSkills: ['node.js', 'PostgreSQL', 'Docker', 'AWS'], experienceYears: 4, city: 'Bangalore', noticePeriodDays: 15,
  expectedCtcLakh: 20, screeningAnswers: [{ id: 'q1', answer: 'yes' }],
};

describe('match score (rules-based)', () => {
  it('scores an ideal candidate 100 / Strong with no knockout', () => {
    const m = computeMatch(job, ideal);
    expect(m.score).toBe(100);
    expect(m.band).toBe('Strong');
    expect(m.knockedOut).toBe(false);
  });

  it('treats Bangalore and Bengaluru as the same city', () => {
    expect(computeMatch(job, ideal).reasons.find((r) => r.key === 'location')?.status).toBe('pass');
  });

  it('flags (never rejects) a wrong must-answer, and an unanswered one', () => {
    expect(computeMatch(job, { ...ideal, screeningAnswers: [{ id: 'q1', answer: 'no' }] }).knockedOut).toBe(true);
    expect(computeMatch(job, { ...ideal, screeningAnswers: [] }).knockedOut).toBe(true);
  });

  it('gives half credit for blanks, so leaving fields empty never beats real answers', () => {
    const blank: MatchApplicant = { confirmedSkills: ['Node.js', 'PostgreSQL', 'Docker', 'AWS'], experienceYears: null, city: null, noticePeriodDays: null, expectedCtcLakh: null, screeningAnswers: [{ id: 'q1', answer: 'yes' }] };
    expect(computeMatch(job, blank).score).toBeLessThan(computeMatch(job, ideal).score);
  });

  it('partially credits experience just under the band and penalises far under', () => {
    const exp = (y: number) => computeMatch(job, { ...ideal, experienceYears: y }).reasons.find((r) => r.key === 'experience')!;
    expect(exp(2).earned).toBeGreaterThan(exp(1).earned);
    expect(exp(0).status).toBe('fail');
  });

  it('remote roles fit anyone; notice is ignored when the employer set no preference', () => {
    const m = computeMatch({ ...job, workType: 'REMOTE', maxNoticeDays: null }, { ...ideal, city: 'Pune', noticePeriodDays: 120 });
    expect(m.reasons.find((r) => r.key === 'location')?.status).toBe('pass');
    expect(m.reasons.some((r) => r.key === 'notice')).toBe(false);
  });

  it('with no must-haves marked, every skill counts as one', () => {
    const m = computeMatch({ ...job, mustHaveSkills: [] }, { ...ideal, confirmedSkills: ['Node.js'] });
    expect(m.reasons.find((r) => r.key === 'must')?.label).toBe('Skills');
    expect(m.reasons.some((r) => r.key === 'nice')).toBe(false);
  });
});

describe('skills normalisation', () => {
  it('matches case- and punctuation-insensitively', () => {
    expect(normalizeSkill(' Node.JS ')).toBe(normalizeSkill('node.js'));
    expect(matchSkills(['Node.js', 'Go'], ['node.js', 'Rust'])).toEqual(['Node.js']);
  });
});

describe('job visibility rule', () => {
  const base = { status: 'OPEN', deletedAt: null, expiresAt: new Date(Date.now() + 864e5) };
  it('open, not deleted, not expired, not on hold = public', () => expect(isListingPublic(base)).toBe(true));
  it('hidden when expired, paused, deleted or on moderation hold', () => {
    expect(isListingPublic({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(false);
    expect(isListingPublic({ ...base, status: 'PAUSED' })).toBe(false);
    expect(isListingPublic({ ...base, deletedAt: new Date() })).toBe(false);
    expect(isListingPublic({ ...base, moderationHold: true })).toBe(false);
  });
});
