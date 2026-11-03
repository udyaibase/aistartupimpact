import dns from 'dns/promises';
import crypto from 'crypto';

/**
 * Generate a secure random verification token (the "ub_" prefix marks Udyaibase tokens in a DNS zone).
 */
export function generateVerificationToken(): string {
  return `ub_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Generate DNS TXT record value
 */
export function generateDNSRecord(token: string): string {
  return `udyaibase-verify=${token}`;
}

/** Where the TXT record goes: the root of the domain (shown as "@" by most DNS providers). */
export const DNS_RECORD_NAME = '@';

/**
 * Extract clean domain from URL
 */
export function extractDomain(url: string): string {
  try {
    // Add protocol if missing
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(urlWithProtocol);
    // Remove www. prefix
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    // Fallback for invalid URLs
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

/** Not-found answers from the resolver (the record or name simply isn't there). */
const NOT_FOUND = new Set(['ENOTFOUND', 'ENODATA', 'ENOTIMP', 'ESERVFAIL', 'NXDOMAIN']);

/**
 * Verify domain ownership by DNS: a TXT record `udyaibase-verify=<token>` at the root of the domain ("@").
 * The older location, `_udyaibase-verify.<domain>`, is still accepted so claims started before the move keep
 * working. The value must match exactly (long TXT values arrive in chunks, which are joined first).
 */
export async function verifyDNS(domain: string, expectedToken: string): Promise<{
  verified: boolean;
  error?: string;
}> {
  const cleanDomain = extractDomain(domain).toLowerCase();
  const expected = `udyaibase-verify=${expectedToken}`;
  let lookupError: string | null = null;
  for (const host of [cleanDomain, `_udyaibase-verify.${cleanDomain}`]) {
    try {
      const records = (await dns.resolveTxt(host)).map((chunks) => chunks.join('').trim());
      if (records.includes(expected)) return { verified: true };
    } catch (error: any) {
      if (!NOT_FOUND.has(error?.code)) lookupError = error?.message ?? 'DNS lookup failed';
    }
  }
  return {
    verified: false,
    error: lookupError
      ? `We couldn't check DNS for ${cleanDomain} right now (${lookupError}). Try again in a minute.`
      : `The TXT record isn't on ${cleanDomain} yet. Add it at @ (the root of the domain) and allow 5–10 minutes, sometimes up to an hour, for DNS to update.`,
  };
}

/**
 * Validate domain format
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  return domainRegex.test(extractDomain(domain));
}
