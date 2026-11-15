import { isPlatformHosted, websiteDomain } from '@udyaibase/utils';

/**
 * Which part of a website address identifies one company, for spotting a startup that's already listed: its
 * registrable domain from the Public Suffix List (www.acme.ai and app.acme.ai are both "acme.ai";
 * acme.vercel.app is its own). Null when the website is only a page on a big platform
 * (linkedin.com/company/acme, sites.google.com/view/acme), because that domain says nothing about the company.
 */
export function listingDomainKey(websiteUrl: string | null | undefined): string | null {
  return websiteDomain(websiteUrl);
}

/**
 * The domain a work email must be on to verify this startup, or null when email can't prove ownership: no company
 * domain (a page on a big platform), or a site on a hosting platform's suffix where nobody has a mailbox.
 * Those startups verify with DNS on their own domain, or through support.
 */
export function emailVerificationDomain(websiteUrl: string | null | undefined): string | null {
  if (isPlatformHosted(websiteUrl)) return null;
  return websiteDomain(websiteUrl);
}
