import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/funding/packs';

/**
 * Who may download funding data. No accounts: an email proves itself with a 6-digit code (lib/otp.ts, purpose
 * OTP_PURPOSE) and gets a short-lived signed "email pass" for the next steps (free PDF, checkout). A paid file is
 * reached through a signed link to its purchase; whether it still works (paid, not refunded, within its access
 * window) is decided by the purchase row on every download, never by the link alone.
 */

export const OTP_PURPOSE = 'funding_data';
const PASS_MINUTES = 30;

function secret() {
  const s = process.env.APPLY_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('No signing secret configured');
  return `${s}:funding-data`;
}

function sign(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret()).update(body).digest('base64url')}`;
}

function open(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(crypto.createHmac('sha256', secret()).update(body).digest('base64url'));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normaliseEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/** Issued once the code checks out; proves the email for PASS_MINUTES. */
export const emailPass = (email: string) => sign({ k: 'pass', e: email.toLowerCase(), x: Date.now() + PASS_MINUTES * 60_000 });

export function verifyEmailPass(token: unknown): string | null {
  const p = open(token);
  return p && p.k === 'pass' && typeof p.e === 'string' && typeof p.x === 'number' && p.x > Date.now() ? p.e : null;
}

/** Download link for a paid purchase. */
export const purchaseToken = (purchaseId: string) => sign({ k: 'dl', p: purchaseId });

export function verifyPurchaseToken(token: unknown): string | null {
  const p = open(token);
  return p && p.k === 'dl' && typeof p.p === 'string' ? p.p : null;
}

/**
 * Newsletter sign-up from the funding downloads. Only called after the email is verified and the required consent
 * box was ticked, so the subscriber is Active straight away and the exact wording is kept as the consent record.
 * A past unsubscribe is overridden only by this fresh, explicit consent.
 */
export async function subscribeWithConsent(email: string, source: 'funding_free' | 'funding_paid', consentAt = new Date()) {
  const e = email.toLowerCase();
  await prisma.newsletterSubscriber.upsert({
    where: { email: e },
    create: {
      id: crypto.randomUUID(), email: e, source, isActive: true, emailVerified: true, tags: [source],
      consentAt, consentText: CONSENT_TEXT, consentVersion: CONSENT_VERSION, consentSource: source,
    },
    update: {
      isActive: true, emailVerified: true, unsubscribedAt: null,
      consentAt, consentText: CONSENT_TEXT, consentVersion: CONSENT_VERSION, consentSource: source,
    },
  });
  // Tag existing subscribers too, so admin can see who came from free vs paid downloads.
  await prisma.$executeRaw`UPDATE "NewsletterSubscriber" SET tags = array_append(tags, ${source}) WHERE email = ${e} AND NOT (${source} = ANY(tags))`;
}
