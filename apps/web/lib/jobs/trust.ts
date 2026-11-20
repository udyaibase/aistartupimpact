import { registrableDomain, websiteDomain } from '@udyaibase/utils';
/**
 * Employer trust rules: who may publish, and when a job may carry a startup's name.
 * A startup link counts only after the employer proves control of the startup's domain.
 */

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.in', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me', 'aol.com', 'zoho.com', 'zohomail.in', 'zohomail.com',
  'rediffmail.com', 'rediff.com', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru',
  'tutanota.com', 'tuta.io', 'hey.com', 'fastmail.com', 'duck.com', 'inbox.com', 'qq.com', '163.com',
]);

export function emailDomain(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at < 1) return null;
  const d = email.trim().toLowerCase().slice(at + 1).replace(/\.$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

/** Registrable domain (eTLD+1) for common suffixes: careers.acme.co.in → acme.co.in. */
export { registrableDomain, websiteDomain };

/** The work email must sit on the startup's own registrable domain (subdomains allowed). */
export function emailMatchesDomain(email: string, companyDomain: string): boolean {
  const d = emailDomain(email);
  if (!d || isFreeMailDomain(d)) return false;
  return registrableDomain(d) === companyDomain.toLowerCase();
}

export interface TrustFields {
  emailVerified: boolean;
  /** An admin marked this employer verified (the "verify employer" switch in the admin app). */
  isVerified?: boolean | null;
  startupId: string | null;
  startupClaimMethod: string | null;
  /** The linked startup's own verification (done only in the founder portal, or by an admin). */
  Startup?: { isVerified: boolean } | null;
  /** The admin company check, for workspaces whose startup isn't founder-verified: PENDING | APPROVED | REJECTED. */
  companyReview?: string | null;
  companyReviewNote?: string | null;
  websiteUrl?: string | null;
}

/** Claim methods that prove the employer really hires for the startup. */
export const VERIFIED_CLAIM_METHODS = ['DOMAIN_OTP', 'DNS_TXT', 'ADMIN', 'FOUNDER'] as const;

/** A startup link is trusted only when proven by company-domain OTP, by the startup's verified founder, or set by an admin. */
export function isClaimVerified(e: Pick<TrustFields, 'startupId' | 'startupClaimMethod'>): boolean {
  return !!e.startupId && (VERIFIED_CLAIM_METHODS as readonly string[]).includes(e.startupClaimMethod ?? '');
}

/**
 * Who shows the "Verified Company" tick to candidates: the one rule, for every page, email and query.
 * Today: a workspace an admin marked verified, or one whose startup link is proven (see isClaimVerified).
 * The job page, the job list and job alerts each used to spell this out themselves. Queries that can't call a
 * function use VERIFIED_CLAIM_METHODS with the same two conditions (lib/jobs/search.ts), and a test keeps the two
 * in step.
 */
export function showsVerifiedTick(e: { isVerified?: boolean | null } & Pick<TrustFields, 'startupId' | 'startupClaimMethod'>): boolean {
  return !!e.isVerified || isClaimVerified(e);
}

/**
 * A verified company, for everything in hiring (publishing without the job limit, the portal's messages, Google
 * job markup): its startup is verified and the link to it is proven, or an admin verified the employer directly.
 * The admin's switch used to give the public tick only, so the portal told a company with the tick to "re-verify".
 */
export function isCompanyVerified(e: Pick<TrustFields, 'isVerified' | 'startupId' | 'startupClaimMethod' | 'Startup'>): boolean {
  return !!e.isVerified || (isClaimVerified(e) && !!e.Startup?.isVerified);
}

/** Live jobs a workspace may have after passing the admin company check, until its founder verifies the startup. */
export const REVIEWED_MAX_LIVE = 2;

/**
 * Who can ask for the admin company check: someone whose own work email is on the company website's domain
 * (asha@acme.ai for acme.ai). Personal emails and other domains can only ask their founder.
 */
export function canRequestReview(memberEmail: string | null | undefined, websiteUrl: string | null | undefined): boolean {
  const d = websiteDomain(websiteUrl);
  return !!d && !!memberEmail && emailMatchesDomain(memberEmail, d);
}

export type PublishGate =
  | { ok: true; tier: 'verified' }
  | { ok: true; tier: 'reviewed'; maxLive: number }
  | { ok: false; code: 'email_unverified' | 'startup_unverified' | 'review_needed' | 'review_pending' | 'review_rejected'; reason: string };

/**
 * Who may put a job live:
 * - a verified company (see isCompanyVerified): a verified startup's own workspace, or an employer an admin verified;
 * - otherwise a workspace that passed the admin company check (website, LinkedIn, MCA), up to REVIEWED_MAX_LIVE live jobs,
 *   labelled "Email verified" and never shown with the verified tick.
 * `memberEmail` is the person pressing Publish: only a work email on the company's domain can ask for the check.
 * `review_needed` and `review_pending` mean the job waits and goes live by itself once the company is cleared.
 */
export function canPublish(e: TrustFields, memberEmail?: string | null): PublishGate {
  if (!e.emailVerified) return { ok: false, code: 'email_unverified', reason: 'Verify your email before publishing. Your job is saved as a draft.' };
  if (isCompanyVerified(e)) return { ok: true, tier: 'verified' };
  if (e.companyReview === 'APPROVED') return { ok: true, tier: 'reviewed', maxLive: REVIEWED_MAX_LIVE };
  if (e.companyReview === 'PENDING') {
    return { ok: false, code: 'review_pending', reason: 'We’re checking your company (same working day, Mon–Sat). This job goes live by itself once the check passes.' };
  }
  if (e.companyReview === 'REJECTED') {
    return { ok: false, code: 'review_rejected', reason: `We couldn’t confirm your company${e.companyReviewNote ? `: ${e.companyReviewNote}` : '.'} Ask your founder to verify the startup on Udyaibase; your job is saved as a draft.` };
  }
  if (canRequestReview(memberEmail, e.websiteUrl)) {
    return { ok: false, code: 'review_needed', reason: 'Your first job is checked by our team before it goes live (same working day, Mon–Sat).' };
  }
  return { ok: false, code: 'startup_unverified', reason: 'Only a verified startup can publish jobs. Ask your founder to verify the startup on Udyaibase; your job is saved as a draft and goes live once they do.' };
}
