/**
 * Offers run from Admin → Billing → Offers. Client-safe: no server imports.
 *
 * An offer is for the hiring portal or the event host portal and gives one of two things:
 *  - a paid plan free for a number of days, granted automatically to accounts that qualify or claimed with a code;
 *  - a discount (a percentage or an amount) on one payment for a paid plan, always with a code.
 * Every offer can have a limit, and a company can use an offer once.
 *
 * The web app grants (apps/web/lib/offers); the admin app creates and watches (apps/admin/app/(dashboard)/billing/
 * offers). Both read the rules from here so they can't disagree.
 */
import { PAID_PLANS, PLANS, type PlanKey } from './employer-plans';
import { HOST_PLANS } from './host-plans';

export const OFFER_PORTALS = ['EMPLOYER', 'HOST'] as const;
export type OfferPortal = (typeof OFFER_PORTALS)[number];
export const PORTAL_LABEL: Record<OfferPortal, string> = { EMPLOYER: 'Hiring portal', HOST: 'Event host portal' };

export const OFFER_BENEFITS = ['FREE_PLAN', 'PERCENT_OFF', 'AMOUNT_OFF'] as const;
export type OfferBenefit = (typeof OFFER_BENEFITS)[number];
export const BENEFIT_LABEL: Record<OfferBenefit, string> = { FREE_PLAN: 'A plan free for a period', PERCENT_OFF: 'A percentage off one payment', AMOUNT_OFF: 'An amount off one payment' };
export const isDiscount = (benefit: string) => benefit === 'PERCENT_OFF' || benefit === 'AMOUNT_OFF';

/** The billing cycle a discount works on. */
export const OFFER_CYCLES = ['ANY', 'MONTHLY', 'ANNUAL'] as const;
export type OfferCycle = (typeof OFFER_CYCLES)[number];
export const CYCLE_LABEL: Record<OfferCycle, string> = { ANY: 'Monthly or yearly', MONTHLY: 'Monthly only', ANNUAL: 'Yearly only' };

/** A discount never takes the whole price: something must be paid, or it would be a free plan with an invoice for nothing. */
export const MAX_PERCENT_OFF = 90;
/** Razorpay's smallest order. A discounted price never goes below it. */
export const MIN_PAYABLE_PAISE = 100;

export const OFFER_TRIGGERS = ['AUTO', 'CODE'] as const;
export type OfferTrigger = (typeof OFFER_TRIGGERS)[number];
export const TRIGGER_LABEL: Record<OfferTrigger, string> = { AUTO: 'Automatic', CODE: 'Promo code' };

export const OFFER_AUDIENCES = ['NEW_WORKSPACES', 'VERIFIED_STARTUPS', 'NEW_HOSTS', 'VERIFIED_FOUNDERS', 'ANY_ACCOUNT'] as const;
export type OfferAudience = (typeof OFFER_AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<OfferAudience, string> = {
  NEW_WORKSPACES: 'Every new hiring workspace',
  VERIFIED_STARTUPS: 'Workspaces verified by the startup’s founder',
  NEW_HOSTS: 'Every new host account',
  VERIFIED_FOUNDERS: 'Hosts who are founders of a verified startup',
  ANY_ACCOUNT: 'Anyone with the code',
};
export const AUDIENCE_HELP: Record<OfferAudience, string> = {
  NEW_WORKSPACES: 'Granted the moment a workspace is created, verified or not.',
  VERIFIED_STARTUPS: 'Only real, listed startups qualify: the founder must have submitted or claimed the startup and verified it.',
  NEW_HOSTS: 'Granted when a host account created during the offer has confirmed its email.',
  VERIFIED_FOUNDERS: 'The host’s email must belong to a founder who submitted or claimed a startup and verified it.',
  ANY_ACCOUNT: 'Any account on this portal. A free-plan code skips accounts already on a paid plan; a discount works for anyone.',
};

/** Who an offer can be for, by portal and by how it is claimed. The first is the default. */
export function audiencesFor(portal: OfferPortal, trigger: OfferTrigger): OfferAudience[] {
  if (portal === 'EMPLOYER') return trigger === 'AUTO' ? ['VERIFIED_STARTUPS', 'NEW_WORKSPACES'] : ['ANY_ACCOUNT', 'VERIFIED_STARTUPS'];
  return trigger === 'AUTO' ? ['VERIFIED_FOUNDERS', 'NEW_HOSTS'] : ['ANY_ACCOUNT', 'VERIFIED_FOUNDERS'];
}

/** The paid plans an offer can give on each portal. */
export const offerPlansFor = (portal: OfferPortal): string[] => (portal === 'EMPLOYER' ? [...PAID_PLANS] : ['PRO']);

export const OFFER_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_MAX_DAYS = 400;
export const OFFER_MAX_CAP = 100_000;

/** A promo code: 4 to 20 capitals and digits, so it reads the same spoken, typed and printed. */
export const OFFER_CODE_RE = /^[A-Z0-9]{4,20}$/;
/** What a customer typed, as we compare it: no spaces or hyphens, capitals. */
export const normalizeOfferCode = (v: unknown) => (typeof v === 'string' ? v.toUpperCase().replace(/[\s-]/g, '').slice(0, 40) : '');
/** A code nobody would guess, without look-alike characters (0/O, 1/I). `random` is injectable for tests. */
export function suggestOfferCode(prefix = '', random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const head = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  let tail = '';
  for (let i = 0; i < 6; i++) tail += alphabet[Math.floor(random() * alphabet.length)];
  return `${head}${tail}`;
}

export interface OfferRules {
  portal: string; benefit: string; plan: string; benefitDays: number; audience: string; trigger: string;
  startsAt: Date | string; endsAt: Date | string; maxRedemptions: number | null; redeemedCount: number; status: string;
}

/** Where an offer stands right now, in the words the admin shows. */
export type OfferState = 'draft' | 'scheduled' | 'running' | 'paused' | 'full' | 'finished' | 'ended';
export const OFFER_STATE_LABEL: Record<OfferState, string> = {
  draft: 'Draft', scheduled: 'Scheduled', running: 'Running', paused: 'Paused', full: 'Fully claimed', finished: 'Finished', ended: 'Ended early',
};

export function offerState(o: Pick<OfferRules, 'status' | 'startsAt' | 'endsAt' | 'maxRedemptions' | 'redeemedCount'>, now: Date = new Date()): OfferState {
  if (o.status === 'DRAFT') return 'draft';
  if (o.status === 'ENDED') return 'ended';
  if (new Date(o.endsAt).getTime() <= now.getTime()) return 'finished';
  if (o.maxRedemptions != null && o.redeemedCount >= o.maxRedemptions) return 'full';
  if (o.status === 'PAUSED') return 'paused';
  return new Date(o.startsAt).getTime() > now.getTime() ? 'scheduled' : 'running';
}

/** True only while an account that qualifies would actually be granted the offer. */
export const offerIsOpen = (o: OfferRules, now: Date = new Date()) => offerState(o, now) === 'running';

export const placesLeft = (o: Pick<OfferRules, 'maxRedemptions' | 'redeemedCount'>) =>
  o.maxRedemptions == null ? null : Math.max(0, o.maxRedemptions - o.redeemedCount);

/** "3 months", "45 days", "1 year": the benefit length as people say it. */
export function benefitLength(days: number): string {
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`;
  if (days % 30 === 0) return `${days / 30} month${days === 30 ? '' : 's'}`;
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function offerPlanName(plan: string, portal: string = 'EMPLOYER'): string {
  if (portal === 'HOST') return plan === 'PRO' ? HOST_PLANS.PRO.name : plan;
  return (PAID_PLANS as string[]).includes(plan) ? PLANS[plan as PlanKey].name : plan;
}

/** The list prices (before GST, in paise) a discount could meet for a plan: monthly, yearly or both. */
export function offerListPrices(plan: string, portal: string, cycle: string = 'ANY'): number[] {
  const monthly = offerPlanPricePaise(plan, portal);
  const yearly = portal === 'HOST' ? (plan === 'PRO' ? HOST_PLANS.PRO.annualPricePaise : 0) : (PAID_PLANS as string[]).includes(plan) ? PLANS[plan as PlanKey].annualPricePaise : 0;
  return (cycle === 'MONTHLY' ? [monthly] : cycle === 'ANNUAL' ? [yearly] : [monthly, yearly]).filter((p) => p > 0);
}

/** Monthly list price of the plan an offer gives, in paise before GST (what the free period is worth each month). */
export function offerPlanPricePaise(plan: string, portal: string): number {
  if (portal === 'HOST') return plan === 'PRO' ? HOST_PLANS.PRO.pricePaise : 0;
  return (PAID_PLANS as string[]).includes(plan) ? PLANS[plan as PlanKey].pricePaise : 0;
}

/** "20% off" or "₹500 off": the size of a discount. */
export function discountSize(o: { benefit?: string; percentOff?: number | null; amountOffPaise?: number | null }): string {
  if (o.benefit === 'PERCENT_OFF') return `${o.percentOff ?? 0}% off`;
  return `₹${Math.round((o.amountOffPaise ?? 0) / 100).toLocaleString('en-IN')} off`;
}

/** "Pro free for 3 months", "20% off Pro", "₹500 off any plan, yearly": the benefit in one phrase. */
export function benefitPhrase(o: { plan: string; benefitDays: number; portal?: string; benefit?: string; percentOff?: number | null; amountOffPaise?: number | null; cycle?: string }): string {
  if (!isDiscount(o.benefit ?? 'FREE_PLAN')) return `${offerPlanName(o.plan, o.portal)} free for ${benefitLength(o.benefitDays)}`;
  const on = o.plan === 'ANY' ? (o.portal === 'HOST' ? 'Pro' : 'any plan') : offerPlanName(o.plan, o.portal);
  return `${discountSize(o)} ${on}${o.cycle === 'ANNUAL' ? ', yearly' : o.cycle === 'MONTHLY' ? ', monthly' : ''}`;
}

/**
 * What a discount takes off a price (before GST), and what is left to pay. Null when the code doesn't work on this
 * plan or cycle. The price never drops below Razorpay's smallest order.
 */
export function applyDiscount(o: { benefit: string; plan: string; cycle: string; percentOff: number | null; amountOffPaise: number | null }, purchase: { plan: string; cycle: string; amountPaise: number }): { discountPaise: number; finalPaise: number } | null {
  if (!isDiscount(o.benefit)) return null;
  if (o.plan !== 'ANY' && o.plan !== purchase.plan) return null;
  if (o.cycle !== 'ANY' && o.cycle !== purchase.cycle) return null;
  const raw = o.benefit === 'PERCENT_OFF' ? Math.round((purchase.amountPaise * Math.min(MAX_PERCENT_OFF, Math.max(0, o.percentOff ?? 0))) / 100) : (o.amountOffPaise ?? 0);
  // Whole rupees, so the invoice's taxable value stays a round figure.
  const discountPaise = Math.max(0, Math.min(Math.round(raw / 100) * 100, purchase.amountPaise - MIN_PAYABLE_PAISE));
  if (discountPaise <= 0) return null;
  return { discountPaise, finalPaise: purchase.amountPaise - discountPaise };
}

export interface OfferInput {
  name: string; headline: string; portal: OfferPortal; benefit: OfferBenefit; plan: string; benefitDays: number; percentOff: number | null; amountOffPaise: number | null; cycle: OfferCycle;
  audience: OfferAudience; trigger: OfferTrigger; code: string | null;
  startsAt: Date; endsAt: Date; maxRedemptions: number | null; showPublicly: boolean;
}
export type OfferField = keyof OfferInput;
export type OfferInputResult = { ok: true; data: OfferInput } | { ok: false; error: string; field: OfferField };

/** Check an offer typed in the admin. Dates arrive as ISO strings (the admin sends India-time picks as instants). */
export function validateOfferInput(raw: unknown): OfferInputResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof r[k] === 'string' ? (r[k] as string).trim().replace(/\s+/g, ' ').slice(0, max) : '');
  const name = str('name', 80);
  if (name.length < 3) return { ok: false, field: 'name', error: 'Give the offer a name of at least 3 characters.' };
  const headline = str('headline', 120);
  if (headline.length < 10) return { ok: false, field: 'headline', error: 'Write what customers get, in at least 10 characters.' };
  const portal = str('portal', 12) as OfferPortal;
  if (!(OFFER_PORTALS as readonly string[]).includes(portal)) return { ok: false, field: 'portal', error: 'Choose the portal this offer is for.' };
  const benefit = (str('benefit', 12) || 'FREE_PLAN') as OfferBenefit;
  if (!(OFFER_BENEFITS as readonly string[]).includes(benefit)) return { ok: false, field: 'benefit', error: 'Choose what the offer gives.' };
  const discount = isDiscount(benefit);
  const plan = str('plan', 12);
  if (!(discount ? ['ANY', ...offerPlansFor(portal)] : offerPlansFor(portal)).includes(plan)) return { ok: false, field: 'plan', error: portal === 'HOST' ? 'Event hosts only have the Pro plan.' : 'Choose Growth, Pro or Scale.' };
  let benefitDays = 0;
  let percentOff: number | null = null;
  let amountOffPaise: number | null = null;
  let cycle: OfferCycle = 'ANY';
  if (!discount) {
    benefitDays = Math.round(Number(r.benefitDays));
    if (!Number.isFinite(benefitDays) || benefitDays < 1 || benefitDays > OFFER_MAX_DAYS) return { ok: false, field: 'benefitDays', error: `The free period must be between 1 and ${OFFER_MAX_DAYS} days.` };
  } else {
    cycle = (str('cycle', 8) || 'ANY') as OfferCycle;
    if (!(OFFER_CYCLES as readonly string[]).includes(cycle)) return { ok: false, field: 'cycle', error: 'Choose which billing the code works on.' };
    if (benefit === 'PERCENT_OFF') {
      percentOff = Math.round(Number(r.percentOff));
      if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > MAX_PERCENT_OFF) return { ok: false, field: 'percentOff', error: `The discount must be between 1% and ${MAX_PERCENT_OFF}%. To give a plan for nothing, use a free-plan offer.` };
    } else {
      amountOffPaise = Math.round(Number(r.amountOffPaise));
      if (!Number.isFinite(amountOffPaise) || amountOffPaise < 100 || amountOffPaise % 100 !== 0) return { ok: false, field: 'amountOffPaise', error: 'Enter the discount in whole rupees, at least ₹1.' };
      // It has to leave something to pay on at least one price it could apply to.
      const prices = (plan === 'ANY' ? offerPlansFor(portal) : [plan]).flatMap((k) => offerListPrices(k, portal, cycle));
      if (!prices.some((p) => amountOffPaise! < p)) return { ok: false, field: 'amountOffPaise', error: 'That is as much as the price itself. Choose a smaller amount, or use a free-plan offer.' };
    }
  }
  // A discount is always claimed with a code at checkout.
  const trigger = (discount ? 'CODE' : str('trigger', 8) || 'AUTO') as OfferTrigger;
  if (!(OFFER_TRIGGERS as readonly string[]).includes(trigger)) return { ok: false, field: 'trigger', error: 'Choose how the offer is claimed.' };
  const audience = str('audience', 24) as OfferAudience;
  if (!audiencesFor(portal, trigger).includes(audience)) return { ok: false, field: 'audience', error: 'Choose who qualifies.' };
  let code: string | null = null;
  if (trigger === 'CODE') {
    code = normalizeOfferCode(r.code);
    if (!OFFER_CODE_RE.test(code)) return { ok: false, field: 'code', error: 'A promo code is 4 to 20 letters and digits, like LAUNCH100.' };
  }
  const startsAt = new Date(String(r.startsAt ?? ''));
  if (Number.isNaN(startsAt.getTime())) return { ok: false, field: 'startsAt', error: 'Choose when the offer starts.' };
  const endsAt = new Date(String(r.endsAt ?? ''));
  if (Number.isNaN(endsAt.getTime())) return { ok: false, field: 'endsAt', error: 'Choose when the offer ends.' };
  if (endsAt.getTime() <= startsAt.getTime()) return { ok: false, field: 'endsAt', error: 'The end must be after the start.' };
  let maxRedemptions: number | null = null;
  if (r.maxRedemptions !== null && r.maxRedemptions !== undefined && r.maxRedemptions !== '') {
    maxRedemptions = Math.round(Number(r.maxRedemptions));
    if (!Number.isFinite(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > OFFER_MAX_CAP) return { ok: false, field: 'maxRedemptions', error: `The limit must be between 1 and ${OFFER_MAX_CAP.toLocaleString('en-IN')}, or empty for no limit.` };
  }
  // A code offer is told to people directly; it is never advertised on a sign-up page.
  return { ok: true, data: { name, headline, portal, benefit, plan, benefitDays, percentOff, amountOffPaise, cycle, audience, trigger, code, startsAt, endsAt, maxRedemptions, showPublicly: trigger === 'AUTO' && r.showPublicly !== false } };
}

/** The company a workspace belongs to, for "one grant per company". Null when it can't be told. */
export function companyKeyOf(e: { startupId?: string | null; verifiedCompanyDomain?: string | null }): string | null {
  if (e.startupId) return `startup:${e.startupId}`;
  if (e.verifiedCompanyDomain) return `domain:${e.verifiedCompanyDomain.toLowerCase()}`;
  return null;
}

// ── Ready-made offers ─────────────────────────────────────────────────────────

/** A starting point in the admin's "New offer" dialog. Dates are filled in when it is picked. */
export interface OfferTemplate {
  key: string; title: string; about: string;
  portal: OfferPortal; trigger: OfferTrigger; audience: OfferAudience; plan: string; benefitDays: number;
  maxRedemptions: number | null; runsForDays: number; name: string; headline: string; codePrefix?: string;
  /** Left out for a free-plan offer. */
  benefit?: OfferBenefit; percentOff?: number; amountOffPaise?: number; cycle?: OfferCycle;
}

export const OFFER_TEMPLATES: OfferTemplate[] = [
  {
    key: 'startup-launch', title: 'Launch offer for verified startups', about: 'The first 100 founders who verify their startup and set up hiring get Pro free for 3 months.',
    portal: 'EMPLOYER', trigger: 'AUTO', audience: 'VERIFIED_STARTUPS', plan: 'PRO', benefitDays: 90, maxRedemptions: 100, runsForDays: 60,
    name: 'Launch offer: verified startups', headline: 'Pro free for 3 months for the first 100 verified startups',
  },
  {
    key: 'hiring-welcome', title: 'Welcome month for new workspaces', about: 'Every company that starts hiring gets Growth free for a month. No limit.',
    portal: 'EMPLOYER', trigger: 'AUTO', audience: 'NEW_WORKSPACES', plan: 'GROWTH', benefitDays: 30, maxRedemptions: null, runsForDays: 30,
    name: 'Welcome month: hiring', headline: 'Growth free for your first month of hiring',
  },
  {
    key: 'founder-host', title: 'Founders hosting events', about: 'Founders of a verified startup get host Pro free for 3 months, for the first 50.',
    portal: 'HOST', trigger: 'AUTO', audience: 'VERIFIED_FOUNDERS', plan: 'PRO', benefitDays: 90, maxRedemptions: 50, runsForDays: 60,
    name: 'Founders hosting events', headline: 'Pro free for 3 months for founders of verified startups',
  },
  {
    key: 'host-welcome', title: 'Welcome month for new hosts', about: 'Every new host gets Pro free for a month once their email is confirmed.',
    portal: 'HOST', trigger: 'AUTO', audience: 'NEW_HOSTS', plan: 'PRO', benefitDays: 30, maxRedemptions: null, runsForDays: 30,
    name: 'Welcome month: hosts', headline: 'Pro free for your first month of hosting',
  },
  {
    key: 'partner-code-hiring', title: 'Partner code for hiring', about: 'A code to hand to an accelerator, investor or community: Pro free for 2 months, 50 uses.',
    portal: 'EMPLOYER', trigger: 'CODE', audience: 'ANY_ACCOUNT', plan: 'PRO', benefitDays: 60, maxRedemptions: 50, runsForDays: 90,
    name: 'Partner code: hiring', headline: 'Pro free for 2 months with your partner code', codePrefix: 'HIRE',
  },
  {
    key: 'community-code-host', title: 'Community code for hosts', about: 'A code for a meetup group or college cell: host Pro free for 2 months, 50 uses.',
    portal: 'HOST', trigger: 'CODE', audience: 'ANY_ACCOUNT', plan: 'PRO', benefitDays: 60, maxRedemptions: 50, runsForDays: 90,
    name: 'Community code: hosts', headline: 'Pro free for 2 months with your community code', codePrefix: 'HOST',
  },
  {
    key: 'hiring-discount', title: 'Discount code for hiring plans', about: '25% off the first payment on any hiring plan, monthly or yearly. 200 uses.',
    portal: 'EMPLOYER', trigger: 'CODE', audience: 'ANY_ACCOUNT', plan: 'ANY', benefitDays: 0, benefit: 'PERCENT_OFF', percentOff: 25, cycle: 'ANY', maxRedemptions: 200, runsForDays: 45,
    name: 'Discount code: hiring', headline: '25% off your first payment on any hiring plan', codePrefix: 'SAVE',
  },
  {
    key: 'host-yearly-discount', title: 'Yearly discount for hosts', about: '20% off a year of host Pro, to move regular hosts onto yearly billing. 100 uses.',
    portal: 'HOST', trigger: 'CODE', audience: 'ANY_ACCOUNT', plan: 'PRO', benefitDays: 0, benefit: 'PERCENT_OFF', percentOff: 20, cycle: 'ANNUAL', maxRedemptions: 100, runsForDays: 45,
    name: 'Yearly discount: hosts', headline: '20% off a year of Pro for event hosts', codePrefix: 'YEAR',
  },
];
