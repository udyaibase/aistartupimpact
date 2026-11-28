/**
 * Event hosts' payout accounts (Razorpay Route), for Billing → Host payouts.
 * A host must have an active payout account before paid tickets can be sold. Bank and identity details live with
 * Razorpay only; we hold the review status, Razorpay's note, the last 4 digits and the account holder's name.
 */

export const PAYOUT_STATUSES = ['NOT_STARTED', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'ACTIVATED', 'SUSPENDED'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  NOT_STARTED: 'Not started',
  UNDER_REVIEW: 'Under review',
  NEEDS_CLARIFICATION: 'Needs details',
  ACTIVATED: 'Active',
  SUSPENDED: 'Suspended',
};

/** Razorpay normally reviews a payout account within a few working days; longer than this is worth chasing. */
export const REVIEW_SLOW_DAYS = 4;

export interface PayoutRow {
  id: string;
  name: string;
  email: string;
  status: PayoutStatus;
  note: string | null;
  bankLast4: string | null;
  beneficiary: string | null;
  updatedAt: string | null;
  /** Days in review or waiting on the host, for the two waiting statuses. */
  waitingDays: number | null;
  slow: boolean;
  /** Events of this host that have at least one paid ticket tier. */
  paidEvents: number;
  /** Paid tickets set up but the account can't receive money yet. */
  blocked: boolean;
}

export const asPayoutStatus = (s: string | null | undefined): PayoutStatus =>
  (PAYOUT_STATUSES as readonly string[]).includes(s ?? '') ? (s as PayoutStatus) : 'NOT_STARTED';

/** One row from the stored fields; `now` is passed in so the waiting time can be tested. */
export function payoutRow(o: {
  id: string; name: string; company: string | null; email: string; payoutStatus: string | null; payoutNote: string | null;
  payoutBankLast4: string | null; payoutBeneficiary: string | null; payoutUpdatedAt: Date | null;
}, paidEvents: number, now: Date): PayoutRow {
  const status = asPayoutStatus(o.payoutStatus);
  const waiting = status === 'UNDER_REVIEW' || status === 'NEEDS_CLARIFICATION';
  const waitingDays = waiting && o.payoutUpdatedAt ? Math.max(0, Math.floor((now.getTime() - o.payoutUpdatedAt.getTime()) / 864e5)) : null;
  return {
    id: o.id, name: o.company || o.name, email: o.email, status, note: o.payoutNote,
    bankLast4: o.payoutBankLast4, beneficiary: o.payoutBeneficiary, updatedAt: o.payoutUpdatedAt?.toISOString() ?? null,
    waitingDays, slow: status === 'UNDER_REVIEW' && waitingDays != null && waitingDays >= REVIEW_SLOW_DAYS,
    paidEvents, blocked: paidEvents > 0 && status !== 'ACTIVATED',
  };
}
