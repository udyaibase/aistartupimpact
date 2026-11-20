import { describe, it, expect } from 'vitest';
import { placeLine, yearsText } from '@/lib/jobs/format';
import { scoreOf, type AiScreenResult } from '@/lib/jobs/ai-screen';

describe('small text the portal repeats', () => {
  it('years of experience read naturally', () => {
    expect(yearsText(0)).toBe('Under 1 yr');
    expect(yearsText(1)).toBe('1 yr');
    expect(yearsText(7)).toBe('7 yrs');
  });

  it('a place line never says the work mode twice', () => {
    expect(placeLine('Remote · India', 'Remote')).toBe('Remote · India');
    expect(placeLine('Bengaluru, India', 'Hybrid')).toBe('Bengaluru, India · Hybrid');
    expect(placeLine(null, 'On-site')).toBe('On-site');
    expect(placeLine('Pune', null)).toBe('Pune');
  });
});

describe('AI review without a readable resume', () => {
  const result = (resumeRead: boolean): AiScreenResult => ({
    mustHaves: [{ skill: 'Python', status: 'evidenced', evidence: 'Python' }, { skill: 'PyTorch', status: 'evidenced', evidence: 'PyTorch' }],
    otherSkills: [], experience: { level: 'strong', evidence: '' },
    summary: '', strengths: [], gaps: [], questions: [], resumeRead,
  } as unknown as AiScreenResult);

  it('never suggests shortlisting on the candidate’s own answers alone', () => {
    expect(scoreOf(result(true)).recommendation).toBe('shortlist');
    const noResume = scoreOf(result(false));
    expect(noResume.recommendation).toBe('consider');
    // The number itself is unchanged: it is worked out from the checks, and the label says what it rests on.
    expect(noResume.fitScore).toBe(scoreOf(result(true)).fitScore);
  });
});
