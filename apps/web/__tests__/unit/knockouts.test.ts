import { describe, it, expect } from 'vitest';
import { blockedQuestion, evaluateKnockouts, isKnockout, numberAnswer, suggestKnockouts } from '@/lib/jobs/knockouts';
import { draftToData, publicQuestions, publishProblems, emptyDraft } from '@/lib/jobs/composer';
import { answerMismatches } from '@/lib/jobs/resume-profile-shared';

const q = (over: Record<string, unknown>) => ({ id: 'q1', question: 'Q', ...over });
const ans = (a: string) => [{ id: 'q1', answer: a }];

describe('knockout pass rules', () => {
  it('yes/no', () => {
    const k = [q({ type: 'yesno', knockoutAnswer: 'yes' })];
    expect(evaluateKnockouts(k, ans('yes')).knockedOut).toBe(false);
    expect(evaluateKnockouts(k, ans('no')).results[0]!.status).toBe('fail');
    expect(evaluateKnockouts(k, ans('')).results[0]!.status).toBe('unknown');
    expect(evaluateKnockouts(k, ans('')).knockedOut).toBe(true); // left unanswered counts as not met
    // Added to the job after they applied (no stored answer at all): never held against them.
    expect(evaluateKnockouts(k, []).results[0]).toMatchObject({ status: 'unknown', detail: 'Asked after they applied', notAsked: true });
    expect(evaluateKnockouts(k, []).knockedOut).toBe(false);
  });

  it('number at the boundaries: exactly N passes, N − 0.5 fails; maximums too', () => {
    const min = [q({ type: 'number', minValue: 3 })];
    expect(evaluateKnockouts(min, ans('3')).knockedOut).toBe(false);
    expect(evaluateKnockouts(min, ans('2.5')).knockedOut).toBe(true);
    expect(evaluateKnockouts(min, ans('5 years')).knockedOut).toBe(false);
    const max = [q({ type: 'number', maxValue: 60 })];
    expect(evaluateKnockouts(max, ans('60')).knockedOut).toBe(false);
    expect(evaluateKnockouts(max, ans('90')).results[0]!.detail).toBe('Answered 90 · needs at most 60');
    expect(evaluateKnockouts([q({ type: 'number', minValue: 2, maxValue: 5 })], ans('6')).knockedOut).toBe(true);
  });

  it('multiple choice with accepted answers', () => {
    const k = [q({ type: 'choice', options: ['B.Tech', 'M.Tech', 'Diploma'], acceptedOptions: ['B.Tech', 'M.Tech'] })];
    expect(evaluateKnockouts(k, ans('M.Tech')).knockedOut).toBe(false);
    expect(evaluateKnockouts(k, ans('Diploma')).knockedOut).toBe(true);
  });

  it('questions without a pass rule never knock anyone out', () => {
    expect(isKnockout(q({ type: 'text' }) as any)).toBe(false);
    expect(isKnockout(q({ type: 'choice', options: ['a', 'b'] }) as any)).toBe(false);
    expect(isKnockout(q({ type: 'number' }) as any)).toBe(false);
    expect(evaluateKnockouts([q({ type: 'text' })], []).knockedOut).toBe(false);
  });

  it('reads numbers as people type them', () => {
    expect(numberAnswer('3')).toBe(3);
    expect(numberAnswer('2.5 yrs')).toBe(2.5);
    expect(numberAnswer('1,20,000')).toBe(120000);
    expect(numberAnswer('none')).toBeNull();
  });
});

describe('blocklist', () => {
  it.each([
    'What is your age?', 'Date of birth?', 'How old are you?', 'Your gender?', 'Are you married?', 'Do you plan to get pregnant?',
    'What is your religion?', 'Which caste do you belong to?', 'Which community are you from?', 'Upload your photo', 'What is your height?',
    'Do you have any disability?',
  ])('blocks: %s', (text) => expect(blockedQuestion(text)).toMatch(/can’t be used for screening/));

  it.each([
    'Are you legally allowed to work in India?', 'How many years of Python do you have?', 'Can you manage a team of 5?',
    'Have you contributed to the open-source community?', 'What is your notice period?', 'Share a link to your portfolio page',
    'Have you worked on photo editing apps?',
  ])('allows: %s', (text) => expect(blockedQuestion(text)).toBeNull());

  it('a blocked question stops publishing', () => {
    const d = { ...emptyDraft(), title: 'ML Engineer', screeningQuestions: [{ id: 'a', question: 'What is your age?', type: 'text' as const, required: true }] };
    expect(publishProblems(d).some((p) => p.field === 'screeningQuestions' && /age/.test(p.message))).toBe(true);
  });
});

describe('saving and showing questions', () => {
  it('keeps clean pass rules; accepted answers must be real options; min/max swap if reversed', () => {
    const { screeningQuestions: qs } = draftToData({ screeningQuestions: [
      { id: 'n', question: 'Years of Python?', type: 'number', required: true, minValue: 6, maxValue: 3 },
      { id: 'c', question: 'Degree?', type: 'choice', required: true, options: ['A', 'B', 'C'], acceptedOptions: ['A', 'Z'] },
      { id: 'all', question: 'Degree?', type: 'choice', required: true, options: ['A', 'B'], acceptedOptions: ['A', 'B'] },
    ] as any });
    expect(qs[0]).toMatchObject({ type: 'number', minValue: 3, maxValue: 6 });
    expect(qs[1]).toMatchObject({ acceptedOptions: ['A'] });
    expect(qs[2]!.acceptedOptions).toBeUndefined(); // every option accepted = no knockout
  });

  it('candidates never see the pass rules', () => {
    const pub = publicQuestions([
      { id: 'n', question: 'Years?', type: 'number', required: true, minValue: 3 },
      { id: 'c', question: 'Degree?', type: 'choice', required: true, options: ['A', 'B'], acceptedOptions: ['A'] },
      { id: 'y', question: 'Office?', type: 'yesno', required: true, knockoutAnswer: 'yes' },
    ]);
    expect(JSON.stringify(pub)).not.toMatch(/minValue|acceptedOptions|knockoutAnswer/);
    expect(pub[0]!.type).toBe('number');
  });

  it('suggests knockouts from the job’s own fields', () => {
    expect(suggestKnockouts({ experienceMin: 3, mustHaveSkills: ['PyTorch'], workType: 'HYBRID', city: 'Pune' })).toEqual([
      { question: 'How many years of relevant work experience do you have?', type: 'number', minValue: 3 },
      { question: 'Have you used PyTorch in a job or a real project?', type: 'yesno', knockoutAnswer: 'yes' },
      { question: 'Can you work from our Pune office on office days?', type: 'yesno', knockoutAnswer: 'yes' },
    ]);
    expect(suggestKnockouts({ experienceMin: 0, workType: 'REMOTE', city: 'Pune' })).toEqual([]);
  });
});

describe('answers that don’t match the resume', () => {
  const profile = (years: number, datedRoles = 2): any => ({ quality: { readable: true }, experience: { years, datedRoles } });
  const questions = [{ id: 'q1', question: 'How many years of Python do you have?', type: 'number' }];

  it('flags big gaps between what was typed and the resume’s dates, for the team to check', () => {
    expect(answerMismatches(profile(1.5), { experienceYears: 5, screeningAnswers: [{ id: 'q1', answer: '5' }] }, questions)).toEqual([
      'Says 5 years of experience; the resume’s role dates add up to 1.5 years.',
      'Answered 5 years to “How many years of Python do you have?”; the resume’s role dates add up to 1.5 years in total.',
    ]);
  });

  it('small differences, unreadable resumes and resumes without dates raise nothing', () => {
    expect(answerMismatches(profile(4), { experienceYears: 5, screeningAnswers: [{ id: 'q1', answer: '4.5' }] }, questions)).toEqual([]);
    expect(answerMismatches({ quality: { readable: false }, experience: { years: 0, datedRoles: 0 } } as any, { experienceYears: 9, screeningAnswers: [] }, questions)).toEqual([]);
    expect(answerMismatches(profile(0, 0), { experienceYears: 9, screeningAnswers: [] }, questions)).toEqual([]);
  });
});
