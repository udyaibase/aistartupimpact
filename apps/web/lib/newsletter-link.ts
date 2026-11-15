import crypto from 'crypto';

/**
 * Signature on newsletter click-tracking links. The admin app signs each link when it sends a campaign
 * (apps/admin/app/(dashboard)/newsletter-admin/actions.ts uses the same formula); the website follows a link to
 * another site, and records a click, only when the signature matches. Without it, anyone could wrap any address
 * in a udyaibase.com link or invent clicks. Uses INTERNAL_API_SECRET, which both apps already share.
 */
export function newsletterLinkSignature(campaignId: string, email: string, url: string, secret = process.env.INTERNAL_API_SECRET): string | null {
  if (!secret) return null;
  return crypto.createHmac('sha256', `${secret}:newsletter-link`).update(`${campaignId}\n${email}\n${url}`).digest('base64url');
}

export function newsletterLinkValid(campaignId: string, email: string, url: string, signature: string | null): boolean {
  const expected = newsletterLinkSignature(campaignId, email, url);
  if (!expected || !signature) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
