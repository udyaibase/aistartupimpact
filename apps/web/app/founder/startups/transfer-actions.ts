'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@udyaibase/database';
import { requireFounderAuth } from '@/lib/founder-auth';
import { founderAtStartupLimit } from '@/lib/founder/limits';
import { emailMatchesDomain } from '@/lib/jobs/trust';
import { moveOwnerLinks } from '@/lib/startups/verification-lifecycle';
import { logFounderActivity } from '@/lib/founder/activity';
import { sendEmail } from '@/lib/email/send';
import { isPlausibleEmail, normalizeEmail } from '@/lib/startups/contact-email';

/**
 * Ownership transfer: the owner sends a single-use link to another person's email. They accept while signed in to
 * a founder account with exactly that email, and become the owner. The verified tick stays (the company's domain
 * proof doesn't change). Links last 7 days; one pending transfer per startup.
 */

const TRANSFER_DAYS = 7;
/** A verified listing handed to someone whose own email isn't on the domain must be re-verified by them within this. */
const OFF_DOMAIN_VERIFY_DAYS = 90;
/** What to do when the recipient already owns a startup (each account can own one). */
const TRANSFER_LIMIT_MESSAGE = 'Your account already owns a startup, and each account can own one. To accept, transfer or delete that startup first (from its edit page), or contact Support to manage more than one.';
const MAX_STARTS_PER_DAY = 5;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function mail(heading: string, lines: string[], cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${esc(l)}</p>`).join('')}
${cta ? `<p style="margin:20px 0 0"><a href="${cta.href}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${esc(cta.label)}</a></p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

async function auditLog(startupId: string, userId: string, action: string, email: string | null) {
  await prisma.startupVerificationLog.create({
    data: { id: crypto.randomUUID(), startupId, userId, action, method: 'TRANSFER', email, success: true },
  });
}

type Result = { success: true } | { success: false; error: string };

/** The owner's pending transfer for a startup, if any (for the edit page). */
export async function getPendingTransferAction(startupId: string) {
  const session = await requireFounderAuth();
  const t = await prisma.startupOwnershipTransfer.findFirst({
    where: { startupId, fromUserId: session.userId, status: 'PENDING', expiresAt: { gt: new Date() } },
    select: { id: true, toEmail: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return t ? { id: t.id, toEmail: t.toEmail, expiresAt: t.expiresAt.toISOString() } : null;
}

export async function startTransferAction(startupId: string, toEmailRaw: string): Promise<(Result & { id?: string; expiresAt?: string })> {
  const session = await requireFounderAuth();
  const toEmail = normalizeEmail(toEmailRaw);
  if (!isPlausibleEmail(toEmail)) return { success: false, error: 'Enter a valid email address.' };

  const startup = await prisma.startup.findFirst({
    where: { id: startupId, deletedAt: null },
    select: { id: true, name: true, slug: true, ownerId: true },
  });
  // Only the owner can hand it over; teammates can't.
  if (!startup || startup.ownerId !== session.userId) return { success: false, error: 'Only the owner can transfer this startup.' };

  const me = await prisma.founderUser.findUnique({ where: { id: session.userId }, select: { email: true, name: true } });
  if (me && normalizeEmail(me.email) === toEmail) return { success: false, error: 'That’s your own email. Enter the new owner’s email.' };

  const recent = await prisma.startupOwnershipTransfer.count({
    where: { fromUserId: session.userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
  });
  if (recent >= MAX_STARTS_PER_DAY) return { success: false, error: 'Too many transfer links today. Try again tomorrow.' };

  const token = crypto.randomBytes(32).toString('base64url');
  const [, created] = await prisma.$transaction([
    prisma.startupOwnershipTransfer.updateMany({ where: { startupId, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: new Date() } }),
    prisma.startupOwnershipTransfer.create({
      data: { startupId, fromUserId: session.userId, toEmail, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TRANSFER_DAYS * 86_400_000) },
      select: { id: true, expiresAt: true },
    }),
  ]);
  await auditLog(startupId, session.userId, 'TRANSFER_STARTED', toEmail);
  await logFounderActivity(session.userId, 'startup_transfer_started', { metadata: { startupId } });

  const sent = await sendEmail({
    to: toEmail,
    type: 'startup_ownership',
    subject: `${me?.name || 'A founder'} wants to make you the owner of ${startup.name} on Udyaibase`,
    html: mail(`Become the owner of ${startup.name}`, [
      `${me?.name || 'The current owner'} is transferring ownership of ${startup.name} on Udyaibase to you.`,
      `Sign in (or create a founder account) with this email address, ${toEmail}, then accept. The link works once and expires in ${TRANSFER_DAYS} days.`,
      'If you weren’t expecting this, ignore the email; nothing changes unless you accept.',
    ], { label: 'Review transfer', href: `${SITE}/founder/transfer/${token}` }),
  });
  if (!sent.success) {
    await prisma.startupOwnershipTransfer.updateMany({ where: { tokenHash: hashToken(token) }, data: { status: 'CANCELLED', respondedAt: new Date() } });
    return { success: false, error: 'We couldn’t send the email right now. Please try again in a few minutes.' };
  }
  revalidatePath(`/founder/startups/${startup.slug}`);
  return { success: true, id: created.id, expiresAt: created.expiresAt.toISOString() };
}

export async function cancelTransferAction(transferId: string): Promise<Result> {
  const session = await requireFounderAuth();
  const r = await prisma.startupOwnershipTransfer.updateMany({
    where: { id: transferId, fromUserId: session.userId, status: 'PENDING' },
    data: { status: 'CANCELLED', respondedAt: new Date() },
  });
  if (!r.count) return { success: false, error: 'This transfer is no longer pending.' };
  return { success: true };
}

/** What the transfer page shows. Never reveals the startup to someone signed in with the wrong email. */
export async function lookupTransfer(token: string) {
  const session = await requireFounderAuth();
  const t = await prisma.startupOwnershipTransfer.findUnique({
    where: { tokenHash: hashToken(String(token ?? '')) },
    select: { id: true, status: true, expiresAt: true, toEmail: true, fromUserId: true, Startup: { select: { name: true, logoUrl: true, ownerId: true, isVerified: true, deletedAt: true } } },
  });
  if (!t || t.Startup.deletedAt) return { state: 'invalid' as const };
  if (t.status !== 'PENDING') return { state: 'used' as const };
  if (t.expiresAt < new Date()) return { state: 'expired' as const };
  if (t.Startup.ownerId !== t.fromUserId) return { state: 'used' as const };
  const me = await prisma.founderUser.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!me || normalizeEmail(me.email) !== t.toEmail) {
    return { state: 'wrong-account' as const, sentTo: t.toEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2') };
  }
  const from = await prisma.founderUser.findUnique({ where: { id: t.fromUserId }, select: { name: true } });
  return {
    state: 'ready' as const,
    startupName: t.Startup.name,
    logoUrl: t.Startup.logoUrl,
    verified: t.Startup.isVerified,
    fromName: from?.name ?? 'The current owner',
    atLimit: await founderAtStartupLimit(session.userId),
    limitMessage: TRANSFER_LIMIT_MESSAGE,
  };
}

export async function respondTransferAction(token: string, accept: boolean): Promise<Result & { slug?: string }> {
  const session = await requireFounderAuth();
  const tokenHash = hashToken(String(token ?? ''));
  const me = await prisma.founderUser.findUnique({ where: { id: session.userId }, select: { email: true, name: true } });
  if (!me) return { success: false, error: 'Please sign in again.' };

  const t = await prisma.startupOwnershipTransfer.findUnique({
    where: { tokenHash },
    select: { id: true, status: true, expiresAt: true, toEmail: true, fromUserId: true, startupId: true, Startup: { select: { name: true, slug: true, ownerId: true, deletedAt: true, isVerified: true, verifiedDomain: true, verificationExpiresAt: true } } },
  });
  if (!t || t.Startup.deletedAt || t.status !== 'PENDING' || t.Startup.ownerId !== t.fromUserId) {
    return { success: false, error: 'This transfer link is no longer valid.' };
  }
  if (t.expiresAt < new Date()) return { success: false, error: 'This transfer link has expired. Ask the owner to send a new one.' };
  if (normalizeEmail(me.email) !== t.toEmail) return { success: false, error: 'Sign in with the email the transfer was sent to.' };

  const from = await prisma.founderUser.findUnique({ where: { id: t.fromUserId }, select: { email: true, name: true } });

  if (!accept) {
    await prisma.startupOwnershipTransfer.update({ where: { id: t.id }, data: { status: 'DECLINED', respondedAt: new Date(), toUserId: session.userId } });
    await auditLog(t.startupId, session.userId, 'TRANSFER_DECLINED', normalizeEmail(me.email));
    if (from) {
      sendEmail({
        to: from.email, type: 'startup_ownership', subject: `${t.Startup.name}: transfer declined`,
        html: mail('Transfer declined', [`${me.name} declined ownership of ${t.Startup.name}. You’re still the owner.`]),
      }).catch(() => {});
    }
    return { success: true };
  }

  if (await founderAtStartupLimit(session.userId)) return { success: false, error: TRANSFER_LIMIT_MESSAGE };

  // Only one of two simultaneous accepts can flip a PENDING transfer.
  const moved = await prisma.$transaction(async (tx) => {
    const claim = await tx.startupOwnershipTransfer.updateMany({
      where: { id: t.id, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: new Date(), toUserId: session.userId },
    });
    if (!claim.count) return false;
    const now = new Date();
    // The verified tick carries over, but a verified listing could otherwise be sold to anyone: when the new owner's
    // email isn't on the verified domain, they get 90 days to verify it themselves (the usual reminders apply).
    const onDomain = !!t.Startup.verifiedDomain && emailMatchesDomain(me.email, t.Startup.verifiedDomain);
    const cap = new Date(now.getTime() + OFF_DOMAIN_VERIFY_DAYS * 86_400_000);
    const shorten = t.Startup.isVerified && !onDomain && (!t.Startup.verificationExpiresAt || t.Startup.verificationExpiresAt > cap);
    const r = await tx.startup.updateMany({
      where: { id: t.startupId, ownerId: t.fromUserId },
      data: { ownerId: session.userId, claimedBy: session.userId, claimedAt: now, ...(shorten ? { verificationExpiresAt: cap, verificationRemindedAt: null } : {}) },
    });
    if (!r.count) throw new Error('owner changed');
    return true;
  }).catch(() => false);
  if (!moved) return { success: false, error: 'This transfer link is no longer valid.' };

  await auditLog(t.startupId, session.userId, 'OWNERSHIP_TRANSFERRED', from?.email ?? null);
  await moveOwnerLinks(t.startupId, t.fromUserId, session.userId);
  await logFounderActivity(session.userId, 'startup_transfer_accepted', { metadata: { startupId: t.startupId } });
  if (from) {
    sendEmail({
      to: from.email, type: 'startup_ownership', subject: `${t.Startup.name}: ownership transferred`,
      html: mail('Ownership transferred', [
        `${me.name} accepted, and is now the owner of ${t.Startup.name} on Udyaibase.`,
        'If you need access again, ask them to add you from their Team page. If you didn’t start this transfer, reply to this email straight away.',
      ]),
    }).catch(() => {});
  }
  revalidatePath('/founder/startups');
  revalidatePath('/founder/dashboard');
  return { success: true, slug: t.Startup.slug };
}
