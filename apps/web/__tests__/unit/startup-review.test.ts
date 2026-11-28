import { describe, it, expect } from 'vitest';
import { reviewStatusOf, validateReviewDecision, reviewTimeline, aiUseProblem, REVIEW_REASONS } from '@udyaibase/utils/startup-review';

describe('where a startup stands in review', () => {
  it('ownership never counts as approval', () => {
    expect(reviewStatusOf({ isApproved: false, reviewStatus: 'IN_REVIEW', claimStatus: 'VERIFIED' })).toBe('IN_REVIEW');
    expect(reviewStatusOf({ isApproved: false, reviewStatus: null, claimStatus: 'CLAIMED' })).toBe('IN_REVIEW');
  });
  it('a live startup is approved whatever else is stored', () => {
    expect(reviewStatusOf({ isApproved: true, reviewStatus: 'IN_REVIEW', claimStatus: 'PENDING' })).toBe('APPROVED');
  });
  it('keeps a rejection recorded the old way, on the ownership field', () => {
    expect(reviewStatusOf({ isApproved: false, reviewStatus: 'IN_REVIEW', claimStatus: 'REJECTED' })).toBe('REJECTED');
    expect(reviewStatusOf({ isApproved: false, reviewStatus: 'CHANGES_REQUESTED', claimStatus: 'REJECTED' })).toBe('CHANGES_REQUESTED');
  });
});

describe('a reviewer’s decision', () => {
  it('approval needs no reason; every other outcome must tell the founder why', () => {
    expect(validateReviewDecision({ action: 'approve' }, 'IN_REVIEW')).toMatchObject({ ok: true });
    expect(validateReviewDecision({ action: 'reject' }, 'IN_REVIEW')).toMatchObject({ ok: false, error: 'Choose a reason.' });
    expect(validateReviewDecision({ action: 'reject', reasonCode: 'OTHER', note: 'no' }, 'IN_REVIEW')).toMatchObject({ ok: false });
    const notAi = validateReviewDecision({ action: 'reject', reasonCode: 'NOT_AI' }, 'IN_REVIEW');
    expect(notAi.ok && notAi.data.note).toBe(REVIEW_REASONS[0].text);
    const edited = validateReviewDecision({ action: 'request_changes', reasonCode: 'INCOMPLETE', note: 'Please add your founders and a longer description.' }, 'IN_REVIEW');
    expect(edited.ok && edited.data.note).toBe('Please add your founders and a longer description.');
  });
  it('a live startup can only be taken down, and only a live one can be', () => {
    expect(validateReviewDecision({ action: 'reject', reasonCode: 'NOT_AI' }, 'APPROVED')).toMatchObject({ ok: false, error: expect.stringMatching(/Take down/) });
    expect(validateReviewDecision({ action: 'approve' }, 'APPROVED')).toMatchObject({ ok: false });
    expect(validateReviewDecision({ action: 'take_down', reasonCode: 'NOT_AI' }, 'APPROVED')).toMatchObject({ ok: true });
    expect(validateReviewDecision({ action: 'take_down', reasonCode: 'NOT_AI' }, 'IN_REVIEW')).toMatchObject({ ok: false });
  });
  it('a turned-down or taken-down startup can be approved later', () => {
    expect(validateReviewDecision({ action: 'approve' }, 'REJECTED')).toMatchObject({ ok: true });
    expect(validateReviewDecision({ action: 'approve' }, 'TAKEN_DOWN')).toMatchObject({ ok: true });
  });
});

describe('what the founder sees', () => {
  it('the timeline shows waiting, stopped and live', () => {
    const state = (s: Parameters<typeof reviewTimeline>[0]) => reviewTimeline(s).steps.map((x) => x.state);
    expect(state({ isApproved: false, isVerified: true, reviewStatus: 'IN_REVIEW' })).toEqual(['done', 'done', 'current', 'todo']);
    expect(state({ isApproved: false, isVerified: false, reviewStatus: 'CHANGES_REQUESTED' })).toEqual(['done', 'optional', 'stopped', 'todo']);
    expect(state({ isApproved: true, isVerified: true })).toEqual(['done', 'done', 'done', 'done']);
  });
  it('the AI answer must say something', () => {
    expect(aiUseProblem('')).toBe('Tell us how your product uses AI.');
    expect(aiUseProblem('AI inside')).toMatch(/a little more/);
    expect(aiUseProblem('Our product reads invoices with our own language model.')).toBeNull();
    expect(aiUseProblem('x'.repeat(601))).toMatch(/600 characters/);
  });
});
