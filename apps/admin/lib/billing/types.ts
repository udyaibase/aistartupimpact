/** One payment from any revenue stream, in one shape. Plain data (dates as ISO text) so pages can hand it to the browser. */
export type Stream = 'EMPLOYER' | 'HOST' | 'FUNDING' | 'ADS';
/** TICKETS is revenue (Udyaibase's share of paid tickets) without ledger rows: it is summed per month and per event. */
export type RevenueStream = Stream | 'TICKETS';
export type PaymentState = 'PAID' | 'PART_REFUNDED' | 'REFUNDED' | 'FAILED';
export type Cycle = 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';

export interface LedgerRow {
  id: string;
  stream: Stream;
  /** What was bought, readable: "Employer plan · Pro". */
  product: string;
  /** Machine code of the product within its stream: GROWTH, PRO, BOOST, STARTER, PACKAGE_PURCHASE… */
  code: string;
  cycle: Cycle;
  accountId: string;
  account: string;
  email: string;
  /** Before GST. */
  amountPaise: number;
  gstPaise: number;
  /** What the customer paid, GST included. */
  totalPaise: number;
  /** Revenue after refunds, before GST. Zero for failed payments. */
  netPaise: number;
  state: PaymentState;
  /** Paid through Razorpay (true) or recorded by hand for an invoice or UPI transfer (false). */
  online: boolean;
  foundingPrice: boolean;
  invoiceNumber: string | null;
  razorpayId: string | null;
  createdAt: string;
  paidAt: string | null;
  failedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  refundedAt: string | null;
  refundAmountPaise: number | null;
  refundReason: string | null;
  refundedBy: string | null;
  creditNoteNumber: string | null;
  /**
   * What Razorpay kept on this payment, GST on the fee included, and the GST part of it. Missing (undefined or null)
   * when the fee has not been fetched from Razorpay yet, or the payment did not go through Razorpay.
   */
  gatewayFeePaise?: number | null;
  gatewayTaxPaise?: number | null;
}

export const STREAM_LABEL: Record<RevenueStream, string> = {
  EMPLOYER: 'Employer plans',
  HOST: 'Event hosts',
  TICKETS: 'Ticket fees',
  FUNDING: 'Funding data',
  ADS: 'Advertising',
};
export const STREAM_HREF: Record<RevenueStream, string> = {
  EMPLOYER: '/billing/employers',
  HOST: '/billing/hosts',
  TICKETS: '/billing/hosts',
  FUNDING: '/billing/funding-data',
  ADS: '/billing/advertising',
};
export const STATE_LABEL: Record<PaymentState, string> = { PAID: 'Paid', PART_REFUNDED: 'Partly refunded', REFUNDED: 'Refunded', FAILED: 'Failed' };
export const CYCLE_LABEL: Record<Cycle, string> = { MONTHLY: 'Monthly', ANNUAL: 'Yearly', ONE_TIME: 'One-time' };
