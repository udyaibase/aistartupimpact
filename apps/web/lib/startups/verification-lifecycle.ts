import { prisma } from '@udyaibase/database';
import { verifyDNS } from '@udyaibase/utils/src/verification/dns';
import { sendEmail } from '@/lib/email/send';
import { claimToken } from '@/lib/startups/claim';
import { VERIFICATION_VALID_DAYS } from '@/lib/startups/ownership';
import { refreshPublicListing } from '@/lib/founder/refresh-listing';

/**
 * Keeping "verified" true over time:
 * - Every verification lasts VERIFICATION_VALID_DAYS (365 days).
 * - DNS-verified startups are re-checked weekly; while the TXT record is still there, the verification renews itself.
 * - Owners get a reminder 30 and 7 days before it lapses (email-verified ones must re-verify; DNS ones only if the
 *   record has gone).
 * - On the day it lapses the blue tick is removed. The owner keeps the listing and can re-verify any time.
 */

const DAY = 86_400_000;
const RECHECK_EVERY_DAYS = 7;
/** A record is treated as gone only after this many weekly checks in a row miss it. */
const DNS_MISSES_BEFORE_ACTION = 3;
/** Once it's treated as gone, the verification ends this long after (with reminders in between) unless restored. */
const DNS_GONE_GRACE_DAYS = 30;
/** Startups verified before expiry existed get at least this long to see a reminder before anything changes. */
const LEGACY_GRACE_DAYS = 90;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com';

/** Resolves to null if the promise takes longer than ms (a slow resolver shouldn't stall the whole run). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function emailHtml(heading: string, paragraphs: string[], cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${esc(p)}</p>`).join('')}
${cta ? `<p style="margin:20px 0 0"><a href="${cta.href}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${esc(cta.label)}</a></p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

async function ownerEmail(ownerId: string | null): Promise<{ email: string; name: string } | null> {
  if (!ownerId) return null;
  const u = await prisma.founderUser.findUnique({ where: { id: ownerId }, select: { email: true, name: true } });
  return u ? { email: u.email, name: u.name } : null;
}

async function log(startupId: string, userId: string | null, action: string, method: string, extra: { email?: string | null; errorMessage?: string | null; success?: boolean } = {}) {
  if (!userId) return; // the log row needs a founder
  await prisma.startupVerificationLog.create({
    data: {
      id: crypto.randomUUID(), startupId, userId, action, method,
      email: extra.email ?? null, errorMessage: extra.errorMessage ?? null, success: extra.success ?? true,
    },
  });
}

/**
 * When ownership moves (DNS takeover or transfer): the startup's hiring workspace belongs to the company, so its
 * jobs stay live, but its founder link moves to the new owner (who, as an Owner there, can remove anyone).
 * Founder team access hangs off the owner's account, so the previous owner's teammates lose access automatically.
 * Replies to reviews stay as the company's replies.
 */
export async function moveOwnerLinks(startupId: string, fromUserId: string, toUserId: string) {
  await prisma.jobBoardEmployer.updateMany({ where: { startupId, founderUserId: fromUserId }, data: { founderUserId: toUserId } });
}

/** DNS proof took a verified startup from another founder: tell them how to dispute it, and keep an undoable record. */
export async function recordTakeover(opts: {
  startupId: string; startupName: string; domain: string; previousOwnerId: string; newOwnerId: string; previousMethod: 'EMAIL' | 'DNS';
}) {
  const [prev, next] = await Promise.all([ownerEmail(opts.previousOwnerId), ownerEmail(opts.newOwnerId)]);
  // Everything needed to put it back: who owned it, how they had proven it, and their email.
  await log(opts.startupId, opts.newOwnerId, 'OWNERSHIP_TAKEN_OVER', 'DNS', {
    email: prev?.email ?? null,
    errorMessage: `previousOwnerId=${opts.previousOwnerId}; previousMethod=${opts.previousMethod}`,
  });
  await moveOwnerLinks(opts.startupId, opts.previousOwnerId, opts.newOwnerId);
  if (prev) {
    const why = opts.previousMethod === 'EMAIL'
      ? `Someone proved control of ${opts.domain} by adding a DNS record. A DNS record is stronger proof than a work email, so ownership of ${opts.startupName} moved to them${next ? ` (${next.name})` : ''}.`
      : `Your DNS record is no longer on ${opts.domain}, and someone else has added theirs, so ownership of ${opts.startupName} moved to them${next ? ` (${next.name})` : ''}. This usually means the domain changed hands.`;
    await sendEmail({
      to: prev.email,
      type: 'startup_ownership',
      subject: `${opts.startupName}: ownership moved to another founder`,
      html: emailHtml(`${opts.startupName} has a new owner on Udyaibase`, [
        why,
        'This wasn’t right? Contact support within 30 days and we’ll look into it. We keep a full record of the change and can put it back.',
        'If they’re on your team, you can also ask them to add you from their Team page.',
      ], { label: 'This wasn’t right? Contact support', href: `${SITE}/founder/support` }),
    }).catch(() => {});
  }
}

export type LifecycleReport = { backfilled: number; rechecked: number; renewed: number; reminded: number; lapsed: number };

/** One daily pass. Safe to run more than once a day: every step is idempotent. */
export async function runVerificationLifecycle(now = new Date(), budgetMs = 200_000): Promise<LifecycleReport> {
  const report: LifecycleReport = { backfilled: 0, rechecked: 0, renewed: 0, reminded: 0, lapsed: 0 };
  // Stay well inside the function timeout; whatever isn't reached today is first in line tomorrow.
  const started = Date.now();
  const outOfTime = () => Date.now() - started > budgetMs;

  // 1. Startups verified before expiry existed: work out the method and give them an expiry with a grace period.
  const legacy = await prisma.startup.findMany({
    where: { isVerified: true, deletedAt: null, verificationExpiresAt: null },
    select: { id: true, verifiedAt: true },
    take: 200,
  });
  for (const s of legacy) {
    const last = await prisma.startupVerificationLog.findFirst({
      where: { startupId: s.id, success: true, action: { in: ['DNS_VERIFIED', 'EMAIL_VERIFIED'] } },
      orderBy: { createdAt: 'desc' },
      select: { method: true },
    });
    const fromVerifiedAt = (s.verifiedAt ?? now).getTime() + VERIFICATION_VALID_DAYS * DAY;
    await prisma.startup.update({
      where: { id: s.id },
      data: {
        verificationMethod: last?.method === 'EMAIL' ? 'EMAIL' : 'DNS',
        verificationExpiresAt: new Date(Math.max(fromVerifiedAt, now.getTime() + LEGACY_GRACE_DAYS * DAY)),
      },
    });
    report.backfilled++;
  }

  // 2. Weekly DNS re-check: still there → renewed for another year.
  const dnsDue = await prisma.startup.findMany({
    where: {
      isVerified: true, deletedAt: null, verificationMethod: 'DNS', verifiedDomain: { not: null },
      OR: [{ verificationCheckedAt: null }, { verificationCheckedAt: { lt: new Date(now.getTime() - RECHECK_EVERY_DAYS * DAY) } }],
    },
    select: { id: true, ownerId: true, verifiedDomain: true, verificationToken: true, verificationDnsMisses: true, verificationExpiresAt: true },
    orderBy: { verificationCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 200,
  });
  for (const s of dnsDue) {
    if (outOfTime()) break;
    report.rechecked++;
    let found = false;
    let inconclusive = !s.ownerId;
    try {
      if (s.ownerId) {
        const token = claimToken({ id: s.id, ownerId: s.ownerId, verificationToken: s.verificationToken }, s.ownerId);
        const r = await withTimeout(verifyDNS(s.verifiedDomain!, token), 8_000);
        found = !!r?.verified;
        inconclusive = !r || !!r.lookupFailed;
      }
    } catch { inconclusive = true; }
    if (!found && inconclusive) {
      // Resolver trouble, not an answer: try again next week without counting a miss.
      await prisma.startup.update({ where: { id: s.id }, data: { verificationCheckedAt: now } });
      continue;
    }
    if (found) {
      await prisma.startup.update({
        where: { id: s.id },
        data: { verificationCheckedAt: now, verificationDnsMisses: 0, verificationExpiresAt: new Date(now.getTime() + VERIFICATION_VALID_DAYS * DAY), verificationRemindedAt: null },
      });
      report.renewed++;
      continue;
    }
    // One failed lookup proves nothing (DNS hiccups). Only after several weeks in a row is the record treated as
    // gone: the verification then ends within 30 days unless it comes back, with the usual reminders.
    const misses = (s.verificationDnsMisses ?? 0) + 1;
    const gone = misses >= DNS_MISSES_BEFORE_ACTION;
    const cap = new Date(now.getTime() + DNS_GONE_GRACE_DAYS * DAY);
    await prisma.startup.update({
      where: { id: s.id },
      data: {
        verificationCheckedAt: now,
        verificationDnsMisses: misses,
        ...(gone && s.verificationExpiresAt && s.verificationExpiresAt > cap ? { verificationExpiresAt: cap } : {}),
      },
    });
    if (gone) await log(s.id, s.ownerId, 'DNS_RECORD_GONE', 'DNS', { success: false, errorMessage: `TXT record missing on ${misses} weekly checks in a row` });
  }

  // 3. Reminders 30 and 7 days before it lapses.
  const soon = await prisma.startup.findMany({
    where: { isVerified: true, deletedAt: null, verificationExpiresAt: { gt: now, lte: new Date(now.getTime() + 30 * DAY) } },
    select: { id: true, name: true, slug: true, ownerId: true, verificationMethod: true, verificationExpiresAt: true, verificationRemindedAt: true, verifiedDomain: true, verifiedEmail: true, verificationDnsMisses: true },
  });
  for (const s of soon) {
    const expires = s.verificationExpiresAt!;
    const weekMark = new Date(expires.getTime() - 7 * DAY);
    const due = !s.verificationRemindedAt || (now >= weekMark && s.verificationRemindedAt < weekMark);
    if (!due) continue;
    const owner = await ownerEmail(s.ownerId);
    if (owner) {
      const days = Math.max(1, Math.ceil((expires.getTime() - now.getTime()) / DAY));
      const how = s.verificationMethod === 'DNS'
        ? `We couldn’t find your DNS record on ${s.verifiedDomain ?? 'your domain'} for the last few weeks. Add it back, or verify again with a work email.`
        : 'Verify again with a code to a work email on your domain (one click below), or add a DNS record, which renews itself while it stays.';
      const method = s.verificationMethod === 'DNS' ? 'dns' : 'email';
      // The account email always gets it; the work email used to verify too, in case only one of them is read.
      const cc = s.verifiedEmail && s.verifiedEmail.toLowerCase() !== owner.email.toLowerCase() ? [s.verifiedEmail] : undefined;
      await sendEmail({
        to: owner.email,
        ...(cc ? { cc } : {}),
        type: 'startup_verification',
        subject: `${s.name}: verification ends in ${days} day${days === 1 ? '' : 's'}`,
        html: emailHtml(`Keep the verified tick on ${s.name}`, [
          `Hi ${owner.name}, the domain verification for ${s.name} ends in ${days} day${days === 1 ? '' : 's'}.`,
          how,
          'If it ends, the blue tick comes off your listing until you verify again. Nothing else changes.',
        ], { label: s.verificationMethod === 'DNS' ? 'Check my DNS record' : 'Send me a new code', href: `${SITE}/founder/claim/${s.id}?method=${method}` }),
      }).catch(() => {});
    }
    await prisma.startup.update({ where: { id: s.id }, data: { verificationRemindedAt: now } });
    report.reminded++;
  }

  // 4. Lapse: remove the tick. The owner keeps the listing and can verify again.
  const expired = await prisma.startup.findMany({
    where: { isVerified: true, deletedAt: null, verificationExpiresAt: { lte: now } },
    select: { id: true, name: true, ownerId: true, verificationMethod: true, verifiedEmail: true },
    take: 200,
  });
  for (const s of expired) {
    await prisma.startup.update({ where: { id: s.id }, data: { isVerified: false, claimStatus: 'CLAIMED' } });
    await log(s.id, s.ownerId, 'VERIFICATION_LAPSED', s.verificationMethod ?? 'DNS', { success: false });
    await refreshPublicListing('startup', s.id).catch(() => {});
    const owner = await ownerEmail(s.ownerId);
    if (owner) {
      const cc = s.verifiedEmail && s.verifiedEmail.toLowerCase() !== owner.email.toLowerCase() ? [s.verifiedEmail] : undefined;
      await sendEmail({
        to: owner.email,
        ...(cc ? { cc } : {}),
        type: 'startup_verification',
        subject: `${s.name}: domain verification has ended`,
        html: emailHtml(`${s.name} is no longer verified`, [
          `Hi ${owner.name}, the domain verification for ${s.name} has ended, so the blue tick is off your listing. You’re still the owner.`,
          'Verify again with a work email or a DNS record to get it back. It takes a couple of minutes.',
        ], { label: 'Verify again', href: `${SITE}/founder/claim/${s.id}?method=${s.verificationMethod === 'DNS' ? 'dns' : 'email'}` }),
      }).catch(() => {});
    }
    report.lapsed++;
  }

  return report;
}
