/**
 * Reviewing a startup submission. Review is separate from ownership: a founder proving they own the domain (the
 * verified badge) says nothing about whether the listing belongs in an AI directory. Shared by the admin (which
 * decides) and the founder portal (which shows where a submission stands).
 */

export const REVIEW_STATUSES = ['IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'TAKEN_DOWN', 'APPROVED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_ACTIONS = ['approve', 'request_changes', 'reject', 'take_down'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  IN_REVIEW: 'In review', CHANGES_REQUESTED: 'Changes requested', REJECTED: 'Not approved', TAKEN_DOWN: 'Taken down', APPROVED: 'Live',
};

/** Ready reasons, each with the sentence the founder reads. The reviewer can edit the text before sending. */
export const REVIEW_REASONS = [
  { code: 'NOT_AI', label: 'Not an AI company', text: 'Udyaibase lists companies whose product is built on AI. From your listing and website we could not see how AI is used in your product. If AI is central to it, tell us how and send it again.' },
  { code: 'INCOMPLETE', label: 'Details missing or unclear', text: 'Some details are missing or unclear. Please complete the description, founders and company details so readers can understand what you do.' },
  { code: 'WEBSITE', label: 'Website not working or not matching', text: 'We could not open your website, or it does not match the company described in the listing. Please check the link.' },
  { code: 'DUPLICATE', label: 'Already listed', text: 'This company is already listed on Udyaibase. Please claim the existing listing instead of adding a new one.' },
  { code: 'NOT_A_STARTUP', label: 'Not a startup (agency, personal site, reseller)', text: 'This looks like an agency, a personal site or a reseller rather than a startup with its own product.' },
  { code: 'PROMOTIONAL', label: 'Promotional or misleading text', text: 'The listing reads as an advertisement or makes claims we cannot check. Please describe the product plainly.' },
  { code: 'OTHER', label: 'Other', text: '' },
] as const;
export type ReviewReasonCode = (typeof REVIEW_REASONS)[number]['code'];
export const reviewReason = (code: string | null | undefined) => REVIEW_REASONS.find((r) => r.code === code) ?? null;

export const REVIEW_NOTE_MAX = 1000;
export const AI_USE_MIN = 20;
export const AI_USE_MAX = 600;

/** Where a startup stands, from its stored fields. `isApproved` wins: a live startup is approved whatever else says. */
export function reviewStatusOf(s: { isApproved?: boolean | null; reviewStatus?: string | null; claimStatus?: string | null }): ReviewStatus {
  if (s.isApproved) return 'APPROVED';
  const stored = s.reviewStatus as ReviewStatus | null | undefined;
  if (stored === 'CHANGES_REQUESTED' || stored === 'REJECTED' || stored === 'TAKEN_DOWN') return stored;
  // Rows from before review had its own column recorded a rejection on the ownership field.
  if (s.claimStatus === 'REJECTED') return 'REJECTED';
  return 'IN_REVIEW';
}

export interface ReviewDecisionInput { action: ReviewAction; reasonCode: ReviewReasonCode | null; note: string | null }

/** Check a reviewer's decision before anything is written. Every outcome except approval must tell the founder why. */
export function validateReviewDecision(raw: unknown, current: ReviewStatus): { ok: true; data: ReviewDecisionInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const action = r.action as ReviewAction;
  if (!REVIEW_ACTIONS.includes(action)) return { ok: false, error: 'Choose what to do with this submission.' };
  const note = typeof r.note === 'string' ? r.note.replace(/\s+\n/g, '\n').trim().slice(0, REVIEW_NOTE_MAX) : '';
  const reason = reviewReason(typeof r.reasonCode === 'string' ? r.reasonCode : null);

  if (action === 'approve') {
    if (current === 'APPROVED') return { ok: false, error: 'This startup is already live.' };
    return { ok: true, data: { action, reasonCode: null, note: null } };
  }
  if (action === 'take_down' && current !== 'APPROVED') return { ok: false, error: 'Only a live startup can be taken down.' };
  if (action !== 'take_down' && current === 'APPROVED') return { ok: false, error: 'This startup is live. Use Take down to remove it from the site.' };
  if (!reason) return { ok: false, error: 'Choose a reason.' };
  const text = note || reason.text;
  if (text.trim().length < 10) return { ok: false, error: 'Tell the founder what to change, in a sentence or two.' };
  return { ok: true, data: { action, reasonCode: reason.code, note: text } };
}

/** The founder's answer to "How does your product use AI?": required, and long enough to say something. */
export function aiUseProblem(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return 'Tell us how your product uses AI.';
  if (v.length < AI_USE_MIN) return `Say a little more about how your product uses AI (at least ${AI_USE_MIN} characters).`;
  if (v.length > AI_USE_MAX) return `Keep the AI answer to ${AI_USE_MAX} characters or fewer.`;
  return null;
}

/** The steps a founder sees, with where they are now. */
export function reviewTimeline(s: { isApproved?: boolean | null; isVerified?: boolean | null; reviewStatus?: string | null; claimStatus?: string | null }) {
  const status = reviewStatusOf(s);
  const stopped = status === 'CHANGES_REQUESTED' || status === 'REJECTED' || status === 'TAKEN_DOWN';
  return {
    status,
    steps: [
      { key: 'submitted', label: 'Submitted', state: 'done' as const },
      { key: 'ownership', label: 'Ownership verified', state: s.isVerified ? 'done' as const : 'optional' as const },
      { key: 'review', label: stopped ? REVIEW_STATUS_LABEL[status] : 'In review', state: status === 'APPROVED' ? 'done' as const : stopped ? 'stopped' as const : 'current' as const },
      { key: 'live', label: 'Live', state: status === 'APPROVED' ? 'done' as const : 'todo' as const },
    ],
  };
}
