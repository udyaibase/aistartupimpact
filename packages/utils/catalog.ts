/**
 * The plan catalog: prices and limits for hiring plans, event host plans and funding-data packs, editable from
 * Admin → Billing → Plans & prices. Client-safe: no server imports.
 *
 * The values in employer-plans.ts, host-plans.ts and funding-packs.ts are the built-in catalog. A saved version
 * (PlanCatalogVersion) is laid over them by `applyCatalog`, which changes those same objects in place, so every
 * reader of PLANS, HOST_PLANS, EVENT_BOOST and PACKS sees the catalog in force without being rewritten. The server
 * loads the version in force with `makeCatalogLoader` (catalog-loader.ts); browser code uses the same `applyCatalog`.
 *
 * What a version can change: prices, numeric limits, which perks each plan includes, the feature lines shown on
 * pricing pages, and the rules around plans (trial, founding price, grace days, certificate price, ticket fee).
 * It cannot add or remove a plan: each plan is wired into the product.
 */
import { PAID_PLANS, PLANS, employerRules, setEmployerRules, type EmployerRules, type PlanKey } from './employer-plans';
import { EVENT_BOOST, EVENT_CERTIFICATES, HOST_PLANS, TICKET_FEE, hostRules, setHostRules, type HostPlanKey, type HostRules } from './host-plans';
import { PACK_KEYS, PACKS, type PackKey } from './funding-packs';

export const EMPLOYER_KEYS: PlanKey[] = ['FREE', 'GROWTH', 'PRO', 'SCALE'];
export const HOST_KEYS: HostPlanKey[] = ['FREE', 'PRO'];

export interface EmployerPlanValues {
  pricePaise: number; annualPricePaise: number; maxActiveJobs: number; aiScreensPerPeriod: number; introRequestsPerPeriod: number; maxSeats: number | null;
  /** Perks: featured badge and placement, jobs in the newsletter and socials, widget without "Powered by Udyaibase". */
  featured: boolean; newsletter: boolean; customBranding: boolean;
  features: string[];
}
export interface HostPlanValues {
  pricePaise: number; annualPricePaise: number; maxUpcomingEvents: number; registrationsPerEvent: number; teamMembers: number; promoEmailsPerPeriod: number;
  /** Perks: every event featured, event pages without Udyaibase branding. */
  featuredEvents: boolean; removeBranding: boolean;
  features: string[];
}
/** The rules around plans. `ticketFeePct` null means "use the server setting". */
export interface CatalogRules { employer: EmployerRules; host: HostRules; certificatePricePaise: number; ticketFeePct: number | null }
export interface BoostValues { pricePaise: number; registrationsPerEvent: number }
export interface PackValues { totalPaise: number; limit: number | null }

/** A whole catalog: every editable value of every plan. */
export interface PlanCatalog {
  employer: Record<PlanKey, EmployerPlanValues>;
  host: Record<HostPlanKey, HostPlanValues>;
  boost: BoostValues;
  funding: Record<PackKey, PackValues>;
  rules: CatalogRules;
}

/** From this many upcoming events on, the host portal says "unlimited". */
export const HOST_UNLIMITED_EVENTS = 1000;
export const MAX_FEATURE_LINES = 8;
export const MAX_FEATURE_CHARS = 120;
export const MAX_TRIAL_DAYS = 90;
export const MAX_GRACE_DAYS = 30;
export const MAX_FOUNDING_DISCOUNT_PCT = 90;
export const MAX_TICKET_FEE_PCT = 30;

const employerOf = (k: PlanKey): EmployerPlanValues => {
  const p = PLANS[k];
  return { pricePaise: p.pricePaise, annualPricePaise: p.annualPricePaise, maxActiveJobs: p.maxActiveJobs, aiScreensPerPeriod: p.aiScreensPerPeriod, introRequestsPerPeriod: p.introRequestsPerPeriod, maxSeats: p.maxSeats, featured: p.featured, newsletter: p.newsletter, customBranding: p.customBranding, features: [...p.features] };
};
const hostOf = (k: HostPlanKey): HostPlanValues => {
  const p = HOST_PLANS[k];
  return { pricePaise: p.pricePaise, annualPricePaise: p.annualPricePaise, maxUpcomingEvents: p.maxUpcomingEvents, registrationsPerEvent: p.registrationsPerEvent, teamMembers: p.teamMembers, promoEmailsPerPeriod: p.promoEmailsPerPeriod, featuredEvents: p.featuredEvents, removeBranding: p.removeBranding, features: [...p.features] };
};

/** The catalog as it stands in memory right now. */
export function currentCatalog(): PlanCatalog {
  return {
    employer: Object.fromEntries(EMPLOYER_KEYS.map((k) => [k, employerOf(k)])) as PlanCatalog['employer'],
    host: Object.fromEntries(HOST_KEYS.map((k) => [k, hostOf(k)])) as PlanCatalog['host'],
    boost: { pricePaise: EVENT_BOOST.pricePaise, registrationsPerEvent: EVENT_BOOST.registrationsPerEvent },
    funding: Object.fromEntries(PACK_KEYS.map((k) => [k, { totalPaise: PACKS[k].totalPaise, limit: PACKS[k].limit }])) as PlanCatalog['funding'],
    rules: { employer: employerRules(), host: hostRules(), certificatePricePaise: EVENT_CERTIFICATES.pricePaise, ticketFeePct: TICKET_FEE.pct },
  };
}

/** The values built into the code, captured before anything is laid over them. */
export const BUILT_IN_CATALOG: PlanCatalog = currentCatalog();

/**
 * Put a catalog in force (or the built-in one, with null). It always starts again from the built-in values, so a
 * version that leaves something out can never keep a stale number from the version before.
 */
export function applyCatalog(catalog: PlanCatalog | null): void {
  const c = catalog ?? BUILT_IN_CATALOG;
  for (const k of EMPLOYER_KEYS) {
    const v = c.employer?.[k] ?? BUILT_IN_CATALOG.employer[k];
    Object.assign(PLANS[k], { ...v, features: [...v.features] });
  }
  for (const k of HOST_KEYS) {
    const v = c.host?.[k] ?? BUILT_IN_CATALOG.host[k];
    Object.assign(HOST_PLANS[k], { ...v, features: [...v.features] });
  }
  Object.assign(EVENT_BOOST, c.boost ?? BUILT_IN_CATALOG.boost);
  for (const k of PACK_KEYS) Object.assign(PACKS[k], c.funding?.[k] ?? BUILT_IN_CATALOG.funding[k]);
  const rules = c.rules ?? BUILT_IN_CATALOG.rules;
  setEmployerRules(rules.employer);
  setHostRules(rules.host);
  EVENT_CERTIFICATES.pricePaise = rules.certificatePricePaise;
  TICKET_FEE.pct = rules.ticketFeePct;
}

export type CatalogResult = { ok: true; data: PlanCatalog } | { ok: false; error: string; path: string };

const NAME: Record<string, string> = { GROWTH: 'Growth', PRO: 'Pro', SCALE: 'Scale', FREE: 'Free', STARTER: 'Starter', FULL: 'Full Dataset' };
const rupeesOf = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/**
 * Check a whole catalog before it is saved or put in force. Every plan must be complete: a catalog is stored whole.
 * `path` names the field at fault, like "employer.PRO.pricePaise", so the admin form can point at it.
 */
export function validateCatalog(raw: unknown): CatalogResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const fail = (path: string, error: string): CatalogResult => ({ ok: false, path, error });
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : NaN);
  const money = (v: unknown) => { const n = int(v); return Number.isNaN(n) || n % 100 !== 0 ? NaN : n; };
  const lines = (v: unknown, path: string): string[] | CatalogResult => {
    if (!Array.isArray(v)) return fail(path, 'Add at least one feature line.');
    const out = v.map((s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '')).filter(Boolean);
    if (!out.length) return fail(path, 'Add at least one feature line.');
    if (out.length > MAX_FEATURE_LINES) return fail(path, `Keep it to ${MAX_FEATURE_LINES} feature lines.`);
    if (out.some((s) => s.length > MAX_FEATURE_CHARS)) return fail(path, `Keep each feature line to ${MAX_FEATURE_CHARS} characters.`);
    return out;
  };

  // ── Hiring plans
  const employer = {} as PlanCatalog['employer'];
  for (const k of EMPLOYER_KEYS) {
    const e = r.employer?.[k] ?? {};
    const at = (f: string) => `employer.${k}.${f}`;
    const pricePaise = money(e.pricePaise), annualPricePaise = money(e.annualPricePaise);
    if (k === 'FREE') {
      if (pricePaise !== 0 || annualPricePaise !== 0) return fail(at('pricePaise'), 'The Free plan costs nothing.');
    } else {
      if (!(pricePaise >= 100)) return fail(at('pricePaise'), `Enter ${NAME[k]}’s monthly price in whole rupees.`);
      if (!(annualPricePaise > pricePaise)) return fail(at('annualPricePaise'), `${NAME[k]}’s yearly price must be more than one month (${rupeesOf(pricePaise)}).`);
      if (!(annualPricePaise < pricePaise * 12)) return fail(at('annualPricePaise'), `${NAME[k]}’s yearly price must be less than 12 months (${rupeesOf(pricePaise * 12)}), or yearly billing costs more than monthly.`);
    }
    const maxActiveJobs = int(e.maxActiveJobs), aiScreensPerPeriod = int(e.aiScreensPerPeriod), introRequestsPerPeriod = int(e.introRequestsPerPeriod);
    if (!(maxActiveJobs >= 1)) return fail(at('maxActiveJobs'), 'Open jobs must be 1 or more.');
    if (!(aiScreensPerPeriod >= 0)) return fail(at('aiScreensPerPeriod'), 'AI reviews must be 0 or more.');
    if (!(introRequestsPerPeriod >= 0)) return fail(at('introRequestsPerPeriod'), 'Intro requests must be 0 or more.');
    const maxSeats = e.maxSeats === null || e.maxSeats === undefined || e.maxSeats === '' ? null : int(e.maxSeats);
    if (maxSeats !== null && !(maxSeats >= 1)) return fail(at('maxSeats'), 'Team seats must be 1 or more, or empty for unlimited.');
    const features = lines(e.features, at('features'));
    if (!Array.isArray(features)) return features;
    // A version saved before perks were editable has none: it keeps the built-in ones.
    const perk = (f: 'featured' | 'newsletter' | 'customBranding') => (typeof e[f] === 'boolean' ? e[f] : BUILT_IN_CATALOG.employer[k][f]);
    employer[k] = { pricePaise, annualPricePaise, maxActiveJobs, aiScreensPerPeriod, introRequestsPerPeriod, maxSeats, featured: perk('featured'), newsletter: perk('newsletter'), customBranding: perk('customBranding'), features };
  }
  // Each plan must be worth more than the one below it, or the upgrade path stops making sense.
  for (let i = 1; i < EMPLOYER_KEYS.length; i++) {
    const lo = EMPLOYER_KEYS[i - 1], hi = EMPLOYER_KEYS[i];
    const a = employer[lo], b = employer[hi];
    if (!(b.pricePaise > a.pricePaise)) return fail(`employer.${hi}.pricePaise`, `${NAME[hi]} must cost more than ${NAME[lo]}.`);
    if (lo !== 'FREE' && !(b.annualPricePaise > a.annualPricePaise)) return fail(`employer.${hi}.annualPricePaise`, `${NAME[hi]}’s yearly price must be more than ${NAME[lo]}’s.`);
    if (!(b.maxActiveJobs >= a.maxActiveJobs)) return fail(`employer.${hi}.maxActiveJobs`, `${NAME[hi]} can’t allow fewer open jobs than ${NAME[lo]}.`);
    if (!(b.aiScreensPerPeriod >= a.aiScreensPerPeriod)) return fail(`employer.${hi}.aiScreensPerPeriod`, `${NAME[hi]} can’t include fewer AI reviews than ${NAME[lo]}.`);
    if (!(b.introRequestsPerPeriod >= a.introRequestsPerPeriod)) return fail(`employer.${hi}.introRequestsPerPeriod`, `${NAME[hi]} can’t include fewer intro requests than ${NAME[lo]}.`);
    if (a.maxSeats === null && b.maxSeats !== null) return fail(`employer.${hi}.maxSeats`, `${NAME[lo]} has unlimited seats, so ${NAME[hi]} must too.`);
    if (a.maxSeats !== null && b.maxSeats !== null && !(b.maxSeats >= a.maxSeats)) return fail(`employer.${hi}.maxSeats`, `${NAME[hi]} can’t have fewer seats than ${NAME[lo]}.`);
    for (const f of ['featured', 'newsletter', 'customBranding'] as const) {
      if (a[f] && !b[f]) return fail(`employer.${hi}.${f}`, `${NAME[lo]} includes this, so ${NAME[hi]} must too.`);
    }
  }

  // ── Event host plans
  const host = {} as PlanCatalog['host'];
  for (const k of HOST_KEYS) {
    const h = r.host?.[k] ?? {};
    const at = (f: string) => `host.${k}.${f}`;
    const pricePaise = money(h.pricePaise), annualPricePaise = money(h.annualPricePaise);
    if (k === 'FREE') {
      if (pricePaise !== 0 || annualPricePaise !== 0) return fail(at('pricePaise'), 'The Free plan costs nothing.');
    } else {
      if (!(pricePaise >= 100)) return fail(at('pricePaise'), 'Enter host Pro’s monthly price in whole rupees.');
      if (!(annualPricePaise > pricePaise)) return fail(at('annualPricePaise'), `Host Pro’s yearly price must be more than one month (${rupeesOf(pricePaise)}).`);
      if (!(annualPricePaise < pricePaise * 12)) return fail(at('annualPricePaise'), `Host Pro’s yearly price must be less than 12 months (${rupeesOf(pricePaise * 12)}).`);
    }
    const maxUpcomingEvents = int(h.maxUpcomingEvents), registrationsPerEvent = int(h.registrationsPerEvent), teamMembers = int(h.teamMembers), promoEmailsPerPeriod = int(h.promoEmailsPerPeriod);
    if (!(maxUpcomingEvents >= 1)) return fail(at('maxUpcomingEvents'), 'Upcoming events must be 1 or more.');
    if (!(registrationsPerEvent >= 1)) return fail(at('registrationsPerEvent'), 'Registrations per event must be 1 or more.');
    if (!(teamMembers >= 1)) return fail(at('teamMembers'), 'Teammates must be 1 or more.');
    if (!(promoEmailsPerPeriod >= 0)) return fail(at('promoEmailsPerPeriod'), 'Promo emails must be 0 or more.');
    const features = lines(h.features, at('features'));
    if (!Array.isArray(features)) return features;
    const perk = (f: 'featuredEvents' | 'removeBranding') => (typeof h[f] === 'boolean' ? h[f] : BUILT_IN_CATALOG.host[k][f]);
    host[k] = { pricePaise, annualPricePaise, maxUpcomingEvents, registrationsPerEvent, teamMembers, promoEmailsPerPeriod, featuredEvents: perk('featuredEvents'), removeBranding: perk('removeBranding'), features };
  }
  for (const f of ['maxUpcomingEvents', 'registrationsPerEvent', 'teamMembers', 'promoEmailsPerPeriod'] as const) {
    if (!(host.PRO[f] >= host.FREE[f])) return fail(`host.PRO.${f}`, 'Host Pro can’t give less than the Free plan.');
  }
  for (const f of ['featuredEvents', 'removeBranding'] as const) {
    if (host.FREE[f] && !host.PRO[f]) return fail(`host.PRO.${f}`, 'The Free plan includes this, so Pro must too.');
  }

  // ── Event Boost
  const boost: BoostValues = { pricePaise: money(r.boost?.pricePaise), registrationsPerEvent: int(r.boost?.registrationsPerEvent) };
  if (!(boost.pricePaise >= 100)) return fail('boost.pricePaise', 'Enter the Event Boost price in whole rupees.');
  if (!(boost.registrationsPerEvent >= host.FREE.registrationsPerEvent)) return fail('boost.registrationsPerEvent', 'A boosted event can’t allow fewer registrations than a Free one.');

  // ── Funding data packs
  const funding = {} as PlanCatalog['funding'];
  for (const k of PACK_KEYS) {
    const f = r.funding?.[k] ?? {};
    const totalPaise = money(f.totalPaise);
    if (!(totalPaise >= 100)) return fail(`funding.${k}.totalPaise`, `Enter the ${NAME[k] ?? k} pack’s price (GST included) in whole rupees.`);
    // The last pack is the whole dataset: it has no size.
    const limit = k === 'FULL' ? null : int(f.limit);
    if (limit !== null && !(limit >= 1)) return fail(`funding.${k}.limit`, 'Startups in the pack must be 1 or more.');
    funding[k] = { totalPaise, limit };
  }
  for (let i = 1; i < PACK_KEYS.length; i++) {
    const lo = PACK_KEYS[i - 1], hi = PACK_KEYS[i];
    if (!(funding[hi].totalPaise > funding[lo].totalPaise)) return fail(`funding.${hi}.totalPaise`, `The ${NAME[hi] ?? hi} pack must cost more than ${NAME[lo] ?? lo}.`);
    const a = funding[lo].limit, b = funding[hi].limit;
    if (a !== null && b !== null && !(b > a)) return fail(`funding.${hi}.limit`, `The ${NAME[hi] ?? hi} pack must hold more startups than ${NAME[lo] ?? lo}.`);
  }

  // ── Rules around plans. A version saved before these were editable keeps the built-in ones.
  const B = BUILT_IN_CATALOG.rules;
  const rr = (r.rules && typeof r.rules === 'object' ? r.rules : {}) as Record<string, any>;
  const pick = (group: Record<string, any> | undefined, key: string, fallback: unknown) => (group && group[key] !== undefined ? group[key] : fallback);
  const er: EmployerRules = {
    graceDays: int(pick(rr.employer, 'graceDays', B.employer.graceDays)), trialDays: int(pick(rr.employer, 'trialDays', B.employer.trialDays)),
    trialPlan: pick(rr.employer, 'trialPlan', B.employer.trialPlan) as PlanKey, trialAiScreens: int(pick(rr.employer, 'trialAiScreens', B.employer.trialAiScreens)),
    foundingLimit: int(pick(rr.employer, 'foundingLimit', B.employer.foundingLimit)), foundingDiscountPct: int(pick(rr.employer, 'foundingDiscountPct', B.employer.foundingDiscountPct)),
    foundingLockMonths: int(pick(rr.employer, 'foundingLockMonths', B.employer.foundingLockMonths)),
  };
  const hr: HostRules = {
    graceDays: int(pick(rr.host, 'graceDays', B.host.graceDays)), foundingLimit: int(pick(rr.host, 'foundingLimit', B.host.foundingLimit)),
    foundingDiscountPct: int(pick(rr.host, 'foundingDiscountPct', B.host.foundingDiscountPct)), foundingLockMonths: int(pick(rr.host, 'foundingLockMonths', B.host.foundingLockMonths)),
  };
  if (!(er.trialDays >= 0 && er.trialDays <= MAX_TRIAL_DAYS)) return fail('rules.employer.trialDays', `The trial must be 0 to ${MAX_TRIAL_DAYS} days. 0 switches it off.`);
  if (!PAID_PLANS.includes(er.trialPlan)) return fail('rules.employer.trialPlan', 'Choose the plan the trial gives: Growth, Pro or Scale.');
  if (!(er.trialAiScreens >= 0)) return fail('rules.employer.trialAiScreens', 'AI reviews in the trial must be 0 or more.');
  for (const [who, x] of [['employer', er], ['host', hr]] as const) {
    if (!(x.graceDays >= 0 && x.graceDays <= MAX_GRACE_DAYS)) return fail(`rules.${who}.graceDays`, `Grace days must be 0 to ${MAX_GRACE_DAYS}.`);
    if (!(x.foundingLimit >= 0 && x.foundingLimit <= 100_000)) return fail(`rules.${who}.foundingLimit`, 'Founding places must be 0 or more. 0 closes the founding price to newcomers.');
    if (!(x.foundingDiscountPct >= 0 && x.foundingDiscountPct <= MAX_FOUNDING_DISCOUNT_PCT)) return fail(`rules.${who}.foundingDiscountPct`, `The founding discount must be 0% to ${MAX_FOUNDING_DISCOUNT_PCT}%.`);
    if (!(x.foundingLockMonths >= 1 && x.foundingLockMonths <= 60)) return fail(`rules.${who}.foundingLockMonths`, 'The founding price must hold for 1 to 60 months.');
  }
  const certificatePricePaise = money(pick(rr, 'certificatePricePaise', B.certificatePricePaise));
  if (!(certificatePricePaise >= 100)) return fail('rules.certificatePricePaise', 'Enter the certificates price in whole rupees.');
  const feeRaw = pick(rr, 'ticketFeePct', B.ticketFeePct);
  const ticketFeePct = feeRaw === null || feeRaw === '' ? null : Number(feeRaw);
  if (ticketFeePct !== null && !(Number.isFinite(ticketFeePct) && ticketFeePct >= 0 && ticketFeePct <= MAX_TICKET_FEE_PCT && Math.round(ticketFeePct * 10) === ticketFeePct * 10)) {
    return fail('rules.ticketFeePct', `The ticket fee must be 0% to ${MAX_TICKET_FEE_PCT}%, with at most one decimal, or empty to use the server setting.`);
  }

  return { ok: true, data: { employer, host, boost, funding, rules: { employer: er, host: hr, certificatePricePaise, ticketFeePct } } };
}

/** One changed value, for the "what will change" list before saving and in the history. */
export interface CatalogChange { path: string; label: string; from: string; to: string }

const show = (path: string, v: unknown): string => {
  if (Array.isArray(v)) return `${v.length} line${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'boolean') return v ? 'Included' : 'Not included';
  if (typeof v === 'string') return NAME[v] ?? v;
  if (v === undefined) return '–';
  if (v === null) return path.endsWith('maxSeats') ? 'Unlimited' : path.endsWith('ticketFeePct') ? 'Server setting' : 'Everything';
  if (/Pct$/.test(path)) return `${v}%`;
  if (/Days$/.test(path)) return `${v} day${v === 1 ? '' : 's'}`;
  if (/Months$/.test(path)) return `${v} month${v === 1 ? '' : 's'}`;
  if (/Paise$/.test(path)) return rupeesOf(v as number);
  return (v as number).toLocaleString('en-IN');
};
const FIELD: Record<string, string> = {
  pricePaise: 'monthly price', annualPricePaise: 'yearly price', maxActiveJobs: 'open jobs', aiScreensPerPeriod: 'AI reviews a month', introRequestsPerPeriod: 'intro requests a month',
  maxSeats: 'team seats', features: 'feature lines', maxUpcomingEvents: 'upcoming events', registrationsPerEvent: 'registrations per event', teamMembers: 'teammates',
  promoEmailsPerPeriod: 'promo emails a month', totalPaise: 'price (GST included)', limit: 'startups in the pack',
  featured: 'featured badge and placement', newsletter: 'jobs in the newsletter and socials', customBranding: 'widget without Udyaibase branding',
  featuredEvents: 'every event featured', removeBranding: 'event pages without Udyaibase branding',
};
const RULE: Record<string, string> = {
  'rules.employer.trialDays': 'Hiring trial: length', 'rules.employer.trialPlan': 'Hiring trial: plan', 'rules.employer.trialAiScreens': 'Hiring trial: AI reviews',
  'rules.employer.graceDays': 'Hiring: grace after a plan ends', 'rules.employer.foundingLimit': 'Hiring founding price: places',
  'rules.employer.foundingDiscountPct': 'Hiring founding price: discount', 'rules.employer.foundingLockMonths': 'Hiring founding price: holds for',
  'rules.host.graceDays': 'Host: grace after Pro ends', 'rules.host.foundingLimit': 'Host founding price: places',
  'rules.host.foundingDiscountPct': 'Host founding price: discount', 'rules.host.foundingLockMonths': 'Host founding price: holds for',
  'rules.certificatePricePaise': 'Event certificates: price', 'rules.ticketFeePct': 'Ticket platform fee',
};
const GROUP: Record<string, string> = { employer: 'Hiring', host: 'Host', funding: 'Funding data' };

/** Every value that differs between two catalogs, in reading order. */
export function catalogChanges(before: PlanCatalog, after: PlanCatalog): CatalogChange[] {
  const out: CatalogChange[] = [];
  const cmp = (path: string, label: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, label, from: show(path, a), to: show(path, b) });
  };
  for (const group of ['employer', 'host', 'funding'] as const) {
    for (const k of Object.keys(after[group])) {
      const rows = (c: PlanCatalog) => c[group] as unknown as Record<string, Record<string, unknown>>;
      const a = rows(before)[k] ?? {}, b = rows(after)[k];
      for (const f of Object.keys(b)) cmp(`${group}.${k}.${f}`, `${GROUP[group]} ${NAME[k] ?? k}: ${FIELD[f] ?? f}`, a[f], b[f]);
    }
  }
  cmp('boost.pricePaise', 'Event Boost: price', before.boost.pricePaise, after.boost.pricePaise);
  cmp('boost.registrationsPerEvent', 'Event Boost: registrations per event', before.boost.registrationsPerEvent, after.boost.registrationsPerEvent);
  for (const path of Object.keys(RULE)) {
    const read = (c: PlanCatalog) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], c);
    cmp(path, RULE[path], read(before), read(after));
  }
  return out;
}
