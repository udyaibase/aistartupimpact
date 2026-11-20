import { describe, it, expect } from 'vitest';
import { nextAction, dueLabel, type NextActionInput } from '@/lib/employer/next-action';
import { CHANNEL_LABEL, channelOf, hiredLabel, isSourcedPending, offerState, outcomeOf, STATUS_LABEL } from '@/lib/employer/stages';
import { skippedStep } from '@/lib/employer/pipeline';
import { canDecide, disagreement } from '@/lib/employer/decisions';
import { cleanAssessmentConfig, isOverdue, meetsPassMark } from '@/lib/employer/assessments';
import { ASSESSMENT_LIBRARY, isOwnPortalLink, rubricTotal } from '@/lib/employer/assessment-config';
import { BUILT_IN, BUILT_IN_LIST, cleanPipelineConfig } from '@/lib/employer/pipeline-templates';
import { cleanSourced } from '@/lib/employer/sourcing';
import { canSeeAmounts } from '@/lib/employer/offers';
import { openingsOf } from '@/lib/employer/job-stages';

const now = new Date('2026-11-19T06:00:00Z'); // Thu 11:30 IST
const base: NextActionInput = {
  status: 'REVIEWED', sourcedState: null, sourcedBy: null, appliedAt: '2026-11-18T06:00:00Z', stageSince: '2026-11-18T06:00:00Z', contactedAt: null,
  onHoldUntil: null, interviewRound: null, joiningDate: null, joinedAt: null, withdrawn: false, assessment: null, offer: null, nextInterview: null,
  pendingFeedback: 0, recruiter: 'asha.rao@acme.ai', decisionOwner: 'ravi@acme.ai',
};

describe('stages and outcomes', () => {
  it('labels and outcomes', () => {
    expect(STATUS_LABEL.SHORTLISTED).toBe('Screening');
    expect(STATUS_LABEL.DECISION).toBe('Final decision');
    expect(outcomeOf('REJECTED', null)).toBe('REJECTED');
    expect(outcomeOf('REJECTED', 'OFFER_DECLINED')).toBe('OFFER_DECLINED');
    expect(outcomeOf('INTERVIEW', 'WITHDRAWN')).toBeNull();
    expect(hiredLabel(null)).toBe('Awaiting joining');
    expect(isSourcedPending('ADDED')).toBe(true);
    expect(isSourcedPending('INTERESTED')).toBe(false);
  });

  it('openings always add up', () => {
    expect(openingsOf(3, 1, 1)).toEqual({ positions: 3, joined: 1, awaiting: 1, available: 1 });
    expect(openingsOf(1, 1, 1).available).toBe(0);
  });

  it('an offer past its date is "Response overdue" unless the expiry was firm', () => {
    const o = { status: 'SENT', answerBy: new Date('2026-11-17T06:30:00Z'), firmExpiry: false };
    expect(offerState(o, now)).toBe('OVERDUE');
    expect(offerState({ ...o, firmExpiry: true }, now)).toBe('EXPIRED');
    expect(offerState({ ...o, answerBy: new Date('2026-11-20') }, now)).toBe('SENT');
  });

  it('records a skipped step only when a used stage was jumped', () => {
    expect(skippedStep('SHORTLISTED', 'INTERVIEW', false)).toBe(false);
    expect(skippedStep('SHORTLISTED', 'INTERVIEW', true)).toBe(true);
    expect(skippedStep('REVIEWED', 'INTERVIEW', false)).toBe(true);
    expect(skippedStep('INTERVIEW', 'DECISION', false)).toBe(false);
    expect(skippedStep('INTERVIEW', 'OFFER', false)).toBe(true);
    expect(skippedStep('OFFER', 'SHORTLISTED', false)).toBe(false);
  });
});

describe('next action on the card', () => {
  it('new and screening go to the recruiter with a 3-day target', () => {
    expect(nextAction(base, now)).toEqual({ text: 'Review', owner: 'Asha Rao', due: '2026-11-21T06:00:00.000Z', overdue: false });
    expect(nextAction({ ...base, status: 'SHORTLISTED', stageSince: '2026-11-10T06:00:00Z' }, now)).toMatchObject({ text: 'Screening call', overdue: true });
  });

  it('sourcing: contact, then follow up', () => {
    expect(nextAction({ ...base, sourcedState: 'ADDED', sourcedBy: 'meera@acme.ai' }, now)).toMatchObject({ text: 'Contact them', owner: 'Meera' });
    expect(nextAction({ ...base, sourcedState: 'CONTACTED', sourcedBy: 'meera@acme.ai', contactedAt: '2026-11-18T06:00:00Z' }, now)).toMatchObject({ text: 'Follow up if no reply' });
  });

  it('assessment: waiting, deadline passed, score it', () => {
    const a = { status: 'SENT', dueAt: '2026-11-20T06:00:00Z', submittedAt: null, reviewedAt: null, reviewerEmail: 'asha.rao@acme.ai' };
    expect(nextAction({ ...base, status: 'ASSESSMENT', assessment: a }, now)).toMatchObject({ text: 'Waiting for their submission', owner: null });
    expect(nextAction({ ...base, status: 'ASSESSMENT', assessment: { ...a, dueAt: '2026-11-18T06:00:00Z' } }, now)).toMatchObject({ text: 'Deadline passed: extend or decide', overdue: true });
    expect(nextAction({ ...base, status: 'ASSESSMENT', assessment: { ...a, status: 'SUBMITTED', submittedAt: '2026-11-19T05:00:00Z' } }, now)).toMatchObject({ text: 'Review and score', owner: 'Asha Rao', overdue: false });
  });

  it('interview: missing feedback first, then the next interview, then schedule', () => {
    expect(nextAction({ ...base, status: 'INTERVIEW', interviewRound: 'Technical', pendingFeedback: 2 }, now)).toMatchObject({ text: 'Feedback pending (2)' });
    expect(nextAction({ ...base, status: 'INTERVIEW', interviewRound: 'Technical', nextInterview: { round: 'Technical', startAt: '2026-11-20T05:30:00Z' } }, now)).toMatchObject({ text: 'Technical interview' });
    expect(nextAction({ ...base, status: 'INTERVIEW', interviewRound: 'Technical' }, now)).toMatchObject({ text: 'Schedule Technical' });
  });

  it('decision and offer go to the decision owner', () => {
    expect(nextAction({ ...base, status: 'DECISION' }, now)).toMatchObject({ text: 'Decide', owner: 'Ravi' });
    expect(nextAction({ ...base, status: 'DECISION', decisionOwner: null }, now)).toMatchObject({ owner: 'Owners' });
    expect(nextAction({ ...base, status: 'OFFER', offer: { status: 'SENT', state: 'OVERDUE', answerBy: '2026-11-17T06:30:00Z' } }, now)).toMatchObject({ text: 'Response overdue', overdue: true });
    expect(nextAction({ ...base, status: 'OFFER', offer: { status: 'DRAFT', state: 'DRAFT', answerBy: null } }, now)).toMatchObject({ text: 'Send offer' });
  });

  it('hired: joining until joined; on hold returns as a task; ended ones have none', () => {
    expect(nextAction({ ...base, status: 'HIRED', joiningDate: '2026-12-01T06:30:00Z' }, now)).toMatchObject({ text: 'Joining', overdue: false });
    expect(nextAction({ ...base, status: 'HIRED', joinedAt: '2026-11-18T06:00:00Z' }, now)).toBeNull();
    expect(nextAction({ ...base, status: 'ON_HOLD', onHoldUntil: '2026-11-18T06:00:00Z' }, now)).toMatchObject({ text: 'Back from hold: resume or contact', overdue: true });
    expect(nextAction({ ...base, status: 'REJECTED' }, now)).toBeNull();
    expect(nextAction({ ...base, withdrawn: true }, now)).toBeNull();
  });

  it('due labels use India calendar days', () => {
    expect(dueLabel('2026-11-19T12:00:00Z', now)).toBe('due today');
    expect(dueLabel('2026-11-20T06:00:00Z', now)).toBe('due tomorrow');
    expect(dueLabel('2026-11-17T06:00:00Z', now)).toBe('2 days overdue');
    expect(dueLabel(null, now)).toBeNull();
  });
});

describe('final decision', () => {
  const job = { decisionOwnerEmail: null, decisionDelegateEmail: null };
  it('defaults to owners; a named owner and delegate replace them', () => {
    expect(canDecide({ role: 'OWNER', email: 'f@acme.ai' }, job)).toBe(true);
    expect(canDecide({ role: 'RECRUITER', email: 'r@acme.ai' }, job)).toBe(false);
    const named = { decisionOwnerEmail: 'em@acme.ai', decisionDelegateEmail: 'r@acme.ai' };
    expect(canDecide({ role: 'RECRUITER', email: 'EM@acme.ai' }, named)).toBe(true);
    expect(canDecide({ role: 'RECRUITER', email: 'r@acme.ai' }, named)).toBe(true);
    expect(canDecide({ role: 'OWNER', email: 'f@acme.ai' }, named)).toBe(false);
  });

  it('disagreement uses the yes/no and the 1–4 ratings we collect', () => {
    expect(disagreement([{ author: 'A', recommendation: 'YES', ratings: { ML: 4 } }, { author: 'B', recommendation: 'YES', ratings: { ML: 3 } }])).toEqual({ conflict: false, skills: [] });
    expect(disagreement([{ author: 'A', recommendation: 'YES', ratings: { ML: 4 } }, { author: 'B', recommendation: 'NO', ratings: { ML: 3 } }]).conflict).toBe(true);
    expect(disagreement([{ author: 'A', recommendation: 'YES', ratings: { ML: 4, SQL: 2 } }, { author: 'B', recommendation: 'YES', ratings: { ML: 2, SQL: 2 } }])).toEqual({ conflict: true, skills: ['ML'] });
    expect(disagreement([])).toEqual({ conflict: false, skills: [] });
  });
});

describe('offers', () => {
  const job = { decisionOwnerEmail: 'em@acme.ai', decisionDelegateEmail: null, recruitersSeeOffers: false };
  it('amounts: owners and the decision owner; recruiters only when allowed; interviewers never', () => {
    expect(canSeeAmounts({ role: 'OWNER', email: 'f@acme.ai' }, job)).toBe(true);
    expect(canSeeAmounts({ role: 'RECRUITER', email: 'em@acme.ai' }, job)).toBe(true);
    expect(canSeeAmounts({ role: 'RECRUITER', email: 'r@acme.ai' }, job)).toBe(false);
    expect(canSeeAmounts({ role: 'RECRUITER', email: 'r@acme.ai' }, { ...job, recruitersSeeOffers: true })).toBe(true);
    expect(canSeeAmounts({ role: 'INTERVIEWER', email: 'em@acme.ai' }, job)).toBe(false);
  });
});

describe('assessment setup', () => {
  it('checks the setup; off is null', () => {
    expect(cleanAssessmentConfig(null)).toEqual({ ok: true, config: null });
    expect(cleanAssessmentConfig({ kind: 'TAKE_HOME', brief: 'short' })).toMatchObject({ ok: false, field: 'brief' });
    expect(cleanAssessmentConfig({ kind: 'EXTERNAL', brief: 'A 60-minute ML test on our partner site.' })).toMatchObject({ ok: false, field: 'url' });
    expect(cleanAssessmentConfig({ kind: 'TAKE_HOME', brief: 'Build a small retrieval demo and share the repo.', passMark: 20, maxScore: 10 })).toMatchObject({ ok: false, field: 'passMark' });
    expect(cleanAssessmentConfig({ kind: 'LIVE' })).toEqual({ ok: true, config: { kind: 'LIVE', title: 'Live exercise', brief: '', url: null, deadlineDays: 3, passMark: null, maxScore: 10, questions: [], rubric: [] } });
    expect(cleanAssessmentConfig({ kind: 'QUESTIONS', questions: ['', ' '] })).toMatchObject({ ok: false, field: 'questions' });
    expect(cleanAssessmentConfig({ kind: 'QUESTIONS', questions: [' Why this role? ', ''] })).toMatchObject({ ok: true, config: { kind: 'QUESTIONS', questions: ['Why this role?'] } });
    expect(cleanAssessmentConfig({ kind: 'WORK_SAMPLE', brief: 'Two projects you are proud of.' })).toMatchObject({ ok: true });
  });
  it('a test link can’t point into this portal (strict on save, lenient on read)', () => {
    expect(isOwnPortalLink('https://udyaibase.com/employer/jobs/abc/edit')).toBe(true);
    expect(isOwnPortalLink('https://admin.udyaibase.com/jobs')).toBe(true);
    expect(isOwnPortalLink('https://www.hackerrank.com/test/xyz')).toBe(false);
    expect(isOwnPortalLink('https://udyaibase.com/jobs/ml-engineer')).toBe(false);
    const bad = { kind: 'EXTERNAL', brief: 'A 60-minute ML test on our partner site.', url: 'https://udyaibase.com/employer/jobs/abc/edit' };
    expect(cleanAssessmentConfig(bad, { strict: true })).toMatchObject({ ok: false, field: 'url' });
    expect(cleanAssessmentConfig(bad)).toMatchObject({ ok: true });
  });
  it('rubric total is weighted, and only once every criterion is scored', () => {
    const r = [{ name: 'Quality', weight: 2 }, { name: 'Speed', weight: 1 }];
    expect(rubricTotal(r, { Quality: 5, Speed: 2 }, 10)).toBe(8);
    expect(rubricTotal(r, { Quality: 5 }, 10)).toBeNull();
    expect(rubricTotal(r, { Quality: 6, Speed: 2 }, 10)).toBeNull();
    expect(rubricTotal([], {}, 10)).toBeNull();
  });
  it('every library preset and built-in template is valid on strict save', () => {
    // Online tests leave the link blank on purpose: each company pastes its own provider's link.
    const withLink = <T extends { kind: string; url: string | null } | null>(c: T) => (c && c.kind === 'EXTERNAL' && !c.url ? { ...c, url: 'https://www.hackerrank.com/test/abc' } : c);
    for (const p of ASSESSMENT_LIBRARY) {
      if (p.config.kind === 'EXTERNAL') expect(cleanAssessmentConfig(p.config, { strict: true }), p.id).toMatchObject({ ok: false, field: 'url' });
      expect(cleanAssessmentConfig(withLink(p.config), { strict: true }), p.id).toMatchObject({ ok: true });
    }
    for (const t of BUILT_IN_LIST) expect(cleanPipelineConfig({ ...t.config, assessment: withLink(t.config.assessment) }, { strict: true }), t.key).toMatchObject({ ok: true });
    expect(new Set(BUILT_IN_LIST.map((t) => t.name)).size).toBe(BUILT_IN_LIST.length);
    expect(BUILT_IN.FOUNDER_LED && BUILT_IN.WITH_ASSESSMENT).toBeTruthy();
  });
  it('the pass mark only advises; overdue only while waiting', () => {
    expect(meetsPassMark({ score: 7, passMark: 6 })).toBe(true);
    expect(meetsPassMark({ score: 5, passMark: null })).toBeNull();
    expect(isOverdue({ status: 'SENT', dueAt: new Date('2026-11-18') }, now)).toBe(true);
    expect(isOverdue({ status: 'SUBMITTED', dueAt: new Date('2026-11-18') }, now)).toBe(false);
  });
  it('pipeline config: rounds cleaned, at least one', () => {
    expect(cleanPipelineConfig({ rounds: [' Technical ', 'technical', ''], assessment: null })).toEqual({ ok: true, config: { assessment: null, rounds: ['Technical'] } });
    expect(cleanPipelineConfig({})).toEqual({ ok: true, config: { assessment: null, rounds: ['Interview'] } });
  });
});

describe('channel', () => {
  it('talent-pool invites are labelled talent pool, not the jobs page', () => {
    expect(CHANNEL_LABEL[channelOf('JOBS_PAGE', 'talent_pool')]).toBe('Talent pool');
    expect(CHANNEL_LABEL[channelOf('JOBS_PAGE', null)]).toBe('Udyaibase AI Jobs');
    expect(channelOf('WIDGET', 'linkedin')).toBe('WIDGET');
  });
});

describe('sourcing input', () => {
  it('needs a name and email; sorts LinkedIn from other profile links; names an Other channel', () => {
    expect(cleanSourced({ fullName: 'A', email: 'x@y.co' })).toMatchObject({ ok: false, field: 'fullName' });
    expect(cleanSourced({ fullName: 'Asha', email: 'nope' })).toMatchObject({ ok: false, field: 'email' });
    const r = cleanSourced({ fullName: ' Asha  Rao ', email: 'ASHA@x.co', linkedinUrl: 'linkedin.com/in/asha', channel: 'Other', channelOther: 'Hackathon', experienceYears: '5' });
    expect(r).toMatchObject({ ok: true, data: { fullName: 'Asha Rao', email: 'asha@x.co', linkedinUrl: 'https://linkedin.com/in/asha', channel: 'Hackathon', experienceYears: 5 } });
    expect(cleanSourced({ fullName: 'Asha', email: 'a@x.co', profileUrl: 'github.com/asha', channel: 'Naukri' })).toMatchObject({ ok: true, data: { portfolioUrl: 'https://github.com/asha', linkedinUrl: null, channel: 'Naukri' } });
  });
});
