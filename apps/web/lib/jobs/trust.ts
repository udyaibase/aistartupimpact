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
  startupId: string | null;
  startupClaimMethod: string | null;
  /** The linked startup's own verification (done only in the founder portal, or by an admin). */
  Startup?: { isVerified: boolean } | null;
}

/** Claim methods that prove the employer really hires for the startup. */
export const VERIFIED_CLAIM_METHODS = ['DOMAIN_OTP', 'DNS_TXT', 'ADMIN', 'FOUNDER'] as const;

/** A startup link is trusted only when proven by company-domain OTP, by the startup's verified founder, or set by an admin. */
export function isClaimVerified(e: Pick<TrustFields, 'startupId' | 'startupClaimMethod'>): boolean {
  return !!e.startupId && (VERIFIED_CLAIM_METHODS as readonly string[]).includes(e.startupClaimMethod ?? '');
}

/**
 * Jobs are published only by a verified startup's own workspace: the startup is verified (founder portal or admin)
 * and the workspace's link to it is trusted (opened or adopted by the founder, or set by an admin).
 * Everyone else can draft; there is no "unverified company" path.
 */
export function canPublish(e: TrustFields): { ok: boolean; reason?: string; code?: 'email_unverified' | 'startup_unverified' } {
  if (!e.emailVerified) return { ok: false, code: 'email_unverified', reason: 'Verify your email before publishing. Your job is saved as a draft.' };
  if (!isClaimVerified(e) || !e.Startup?.isVerified) {
    return { ok: false, code: 'startup_unverified', reason: 'Only a verified startup can publish jobs. Ask your founder to verify the startup on Udyaibase; your job is saved as a draft.' };
  }
  return { ok: true };
}
