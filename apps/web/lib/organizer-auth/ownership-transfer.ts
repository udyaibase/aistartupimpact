import crypto from "crypto";
import { prisma } from "@udyaibase/database";
import { sendEmailFireAndForget } from "@/lib/email/send";

/**
 * Handing an organizer workspace to another person.
 *
 * A workspace is an EventOrganizer row, and that row is also the owner's sign-in (email, password, Google link).
 * Everything else (events, plan, invoices, widgets, series, team, review status) hangs off the row's id. So instead
 * of moving all of that, a transfer swaps who signs in to the row:
 *
 *  1. The owner picks one of the workspace's active Admins and confirms. The Admin gets an emailed link (7 days).
 *  2. The Admin, signed in to their own account, accepts. In one transaction:
 *     - the old owner's sign-in moves to a new account of their own, which stays on the team as an Admin;
 *     - the Admin's sign-in moves onto the workspace row, so they now open it as its owner; their old, empty
 *       account is removed, and the teams they were on follow them;
 *     - payout bank details are cleared (they were verified with the old owner's PAN and bank), and so is the
 *       company-email badge (it proved the old owner's work email).
 *
 * The Admin's own account must be empty (no events, series, payments, payouts, live widgets or team), since it is
 * removed. While paid ticket money from a recent or upcoming event is still held for payout, the transfer waits.
 */

export const TRANSFER_DAYS = 7;
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com").replace(/\/$/, "");
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export class TransferError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Why the workspace can't change hands right now, or null. */
export async function workspaceTransferProblem(workspaceId: string): Promise<string | null> {
  const w = await prisma.eventOrganizer.findUnique({ where: { id: workspaceId }, select: { status: true, deactivatedAt: true, deletedAt: true } });
  if (!w || w.deletedAt) return "Workspace not found.";
  if (w.status === "SUSPENDED" || w.deactivatedAt) return "This workspace is suspended or deactivated, so it can’t be transferred.";
  // Ticket money is routed to the current owner's payout account when a ticket is sold and released after the
  // event: wait until nothing is held, so it isn't paid to someone who no longer runs the workspace.
  const held = await prisma.eventRegistration.count({
    where: {
      deletedAt: null, paymentStatus: "PAID", refundedAt: null,
      event: { organizerId: workspaceId, endAt: { gt: new Date(Date.now() - 3 * 864e5) } },
    },
  });
  if (held) return "Paid ticket money from a recent or upcoming event is still being paid out to the current owner’s bank account. Transfer the workspace once those events have ended and been paid out (3 days after the last one).";
  return null;
}

/** Why this account can't take over a workspace, or null. Its own workspace must be empty, because it is removed. */
export async function newOwnerProblem(accountId: string): Promise<string | null> {
  const a = await prisma.eventOrganizer.findUnique({
    where: { id: accountId },
    select: { emailVerified: true, status: true, deactivatedAt: true, deletedAt: true, payoutAccountId: true },
  });
  if (!a || a.deletedAt) return "The new owner’s account no longer exists.";
  if (!a.emailVerified || a.status === "SUSPENDED" || a.deactivatedAt) return "The new owner’s account isn’t active.";
  const [events, series, payments, liveWidgets, team, integrations] = await Promise.all([
    prisma.event.count({ where: { organizerId: accountId } }),
    prisma.eventSeries.count({ where: { organizerId: accountId } }),
    prisma.organizerPayment.count({ where: { organizerId: accountId } }),
    prisma.embedWidget.count({ where: { organizerId: accountId, firstSeenAt: { not: null } } }),
    prisma.eventTeamMember.count({ where: { organizerId: accountId, status: { in: ["ACTIVE", "PENDING"] } } }),
    prisma.organizerIntegration.count({ where: { organizerId: accountId } }),
  ]);
  if (events || series || payments || a.payoutAccountId || liveWidgets || team || integrations) {
    return "The new owner already runs their own workspace (events, series, payments, payouts, a live widget, a team or a connected meeting app). Only someone whose own workspace is empty can take over this one.";
  }
  return null;
}

/** The pending request for a workspace, if any. */
export async function pendingTransfer(workspaceId: string) {
  return prisma.organizerOwnershipTransfer.findFirst({
    where: { organizerId: workspaceId, status: "PENDING", expiresAt: { gt: new Date() } },
    select: { id: true, toEmail: true, expiresAt: true, createdAt: true },
  });
}

/** Start a transfer to an active Admin. Replaces any earlier pending request. */
export async function startOwnershipTransfer(workspaceId: string, memberId: string) {
  const member = await prisma.eventTeamMember.findFirst({
    where: { id: memberId, organizerId: workspaceId },
    select: { id: true, email: true, role: true, status: true, memberOrganizerId: true },
  });
  if (!member || member.status !== "ACTIVE") throw new TransferError("Choose an active teammate.");
  if (member.role !== "ADMIN") throw new TransferError("Make this person an Admin first. Ownership can only go to an Admin.");
  const account = member.memberOrganizerId
    ? await prisma.eventOrganizer.findUnique({ where: { id: member.memberOrganizerId }, select: { id: true, email: true, name: true } })
    : await prisma.eventOrganizer.findFirst({ where: { email: { equals: member.email, mode: "insensitive" }, emailVerified: true }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true } });
  if (!account || account.id === workspaceId) throw new TransferError("This teammate doesn’t have an account yet. Ask them to sign in once, then try again.");

  const problem = (await workspaceTransferProblem(workspaceId)) ?? (await newOwnerProblem(account.id));
  if (problem) throw new TransferError(problem, 409);

  const workspace = await prisma.eventOrganizer.findUnique({ where: { id: workspaceId }, select: { name: true, company: true } });
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TRANSFER_DAYS * 864e5);
  await prisma.$transaction([
    prisma.organizerOwnershipTransfer.updateMany({ where: { organizerId: workspaceId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } }),
    prisma.organizerOwnershipTransfer.create({
      data: { organizerId: workspaceId, toMemberId: member.id, toAccountId: account.id, toEmail: account.email, tokenHash: sha(token), expiresAt },
    }),
  ]);

  const name = workspace?.company || workspace?.name || "an organizer workspace";
  sendEmailFireAndForget({
    to: account.email,
    subject: `You’ve been asked to take over ${name} on Udyaibase Events`,
    type: "organizer_ownership_transfer",
    html: `<p>Hi ${esc(account.name || "there")},</p>
<p>The owner of <strong>${esc(name)}</strong> wants to hand the workspace over to you. As owner you’ll control its events, plan, team and payouts.</p>
<p><a href="${SITE()}/organizer/transfer?token=${token}">Review and accept</a> (sign in as ${esc(account.email)} first). The link works for ${TRANSFER_DAYS} days.</p>
<p style="font-size:13px;color:#6b7280">Or copy this link: ${SITE()}/organizer/transfer?token=${token}</p>
<p>If you weren’t expecting this, ignore the email: nothing changes unless you accept.</p>`,
  });
  return { toEmail: account.email, expiresAt };
}

export async function cancelOwnershipTransfer(workspaceId: string): Promise<number> {
  return (await prisma.organizerOwnershipTransfer.updateMany({
    where: { organizerId: workspaceId, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  })).count;
}

/** A pending request from its link, with what the accept page shows. */
export async function readTransfer(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const t = await prisma.organizerOwnershipTransfer.findUnique({ where: { tokenHash: sha(token) } });
  if (!t || t.status !== "PENDING") return null;
  if (t.expiresAt < new Date()) {
    await prisma.organizerOwnershipTransfer.update({ where: { id: t.id }, data: { status: "EXPIRED", decidedAt: new Date() } });
    return null;
  }
  const w = await prisma.eventOrganizer.findUnique({ where: { id: t.organizerId }, select: { name: true, company: true, email: true, payoutAccountId: true, plan: true } });
  if (!w) return null;
  return { transfer: t, workspace: { name: w.company || w.name, ownerName: w.name, hasPayouts: !!w.payoutAccountId, plan: w.plan } };
}

/**
 * Accept: the signed-in account must be the one the request was made for. Re-checks everything, then swaps the
 * sign-ins in one transaction. Returns the workspace id (the accepter now signs in to it) and the old owner's new id.
 */
export async function acceptOwnershipTransfer(token: string, signedInAccountId: string): Promise<{ workspaceId: string; previousOwnerAccountId: string; oldOwnerEmail: string; oldOwnerName: string; newOwnerEmail: string; workspaceName: string }> {
  const found = await readTransfer(token);
  if (!found) throw new TransferError("This link has expired or was cancelled. Ask the owner to send it again.", 410);
  const t = found.transfer;
  if (t.toAccountId !== signedInAccountId) throw new TransferError(`Sign in as ${t.toEmail} to accept this transfer.`, 403);

  const member = await prisma.eventTeamMember.findFirst({ where: { id: t.toMemberId, organizerId: t.organizerId }, select: { status: true, role: true } });
  if (!member || member.status !== "ACTIVE" || member.role !== "ADMIN") throw new TransferError("You’re no longer an Admin of this workspace, so the transfer can’t go ahead.", 409);
  const problem = (await workspaceTransferProblem(t.organizerId)) ?? (await newOwnerProblem(t.toAccountId));
  if (problem) throw new TransferError(problem, 409);

  const W = await prisma.eventOrganizer.findUniqueOrThrow({ where: { id: t.organizerId } });
  const B = await prisma.eventOrganizer.findUniqueOrThrow({ where: { id: t.toAccountId } });
  const now = new Date();
  const stamp = now.getTime();

  const previousOwnerAccountId = await prisma.$transaction(async (tx) => {
    // Claim the request first, so two accepts can't both run.
    const claimed = await tx.organizerOwnershipTransfer.updateMany({ where: { id: t.id, status: "PENDING" }, data: { status: "ACCEPTED", decidedAt: now } });
    if (!claimed.count) throw new TransferError("This transfer was already completed or cancelled.", 409);

    // Teams the old owner (W's sign-in) and the new owner (B) were on elsewhere, bound to their account ids.
    const oldOwnerTeams = await tx.eventTeamMember.findMany({ where: { memberOrganizerId: W.id, organizerId: { not: W.id } }, select: { id: true } });
    const newOwnerTeams = await tx.eventTeamMember.findMany({ where: { memberOrganizerId: B.id, organizerId: { notIn: [W.id, B.id] } }, select: { id: true } });

    // Free the unique sign-in fields on both rows before reassigning them.
    await tx.eventOrganizer.update({
      where: { id: W.id },
      data: { email: `transfer-${W.id}-${stamp}@transfer.invalid`, googleId: null, unifiedUserId: null, verifyToken: null, pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null },
    });
    await tx.eventOrganizer.update({
      where: { id: B.id },
      data: { email: `transfer-${B.id}-${stamp}@transfer.invalid`, googleId: null, unifiedUserId: null, verifyToken: null, pendingEmail: null, emailChangeToken: null },
    });

    // The old owner's sign-in becomes an account of their own.
    const oldOwner = await tx.eventOrganizer.create({
      data: {
        email: W.email, name: W.name, passwordHash: W.passwordHash, googleId: W.googleId, unifiedUserId: W.unifiedUserId,
        phone: W.phone, emailVerified: true, status: "ACTIVE", onboardingCompleted: true, onboardingStep: W.onboardingStep,
        twoFactorEnabled: W.twoFactorEnabled, twoFactorSecret: W.twoFactorSecret, twoFactorBackupCodes: W.twoFactorBackupCodes,
        lastLoginAt: W.lastLoginAt,
      },
      select: { id: true },
    });

    // The new owner's sign-in moves onto the workspace. Payout and company-email checks belonged to the old owner.
    await tx.eventOrganizer.update({
      where: { id: W.id },
      data: {
        email: B.email, name: B.name, passwordHash: B.passwordHash, googleId: B.googleId, unifiedUserId: B.unifiedUserId,
        emailVerified: true, failedLoginAttempts: 0, lockedUntil: null, sessionsValidAfter: now,
        twoFactorEnabled: B.twoFactorEnabled, twoFactorSecret: B.twoFactorSecret, twoFactorBackupCodes: B.twoFactorBackupCodes,
        payoutAccountId: null, payoutProductId: null, payoutStatus: null, payoutBankLast4: null, payoutBeneficiary: null, payoutNote: null, payoutUpdatedAt: now,
        companyEmail: null, companyDomain: null, companyEmailVerified: false, companyEmailVerifiedAt: null,
      },
    });

    // Teams follow their people.
    if (oldOwnerTeams.length) await tx.eventTeamMember.updateMany({ where: { id: { in: oldOwnerTeams.map((m) => m.id) } }, data: { memberOrganizerId: oldOwner.id } });
    if (newOwnerTeams.length) await tx.eventTeamMember.updateMany({ where: { id: { in: newOwnerTeams.map((m) => m.id) } }, data: { memberOrganizerId: W.id } });

    // The new owner no longer needs a membership here; the old owner joins as an Admin.
    await tx.eventTeamMember.update({ where: { id: t.toMemberId }, data: { status: "REVOKED", memberOrganizerId: null } });
    await tx.eventTeamMember.upsert({
      where: { organizerId_email: { organizerId: W.id, email: W.email } },
      create: {
        organizerId: W.id, email: W.email, role: "ADMIN", status: "ACTIVE", memberOrganizerId: oldOwner.id,
        inviteToken: crypto.randomBytes(24).toString("hex"), expiresAt: now, acceptedAt: now,
      },
      update: { role: "ADMIN", status: "ACTIVE", memberOrganizerId: oldOwner.id, acceptedAt: now },
    });
    await tx.eventTeamAssignment.deleteMany({ where: { teamMember: { organizerId: W.id, email: W.email } } });

    // Everyone signs in again: the old owner's devices were signed in to the workspace row.
    await tx.eventOrganizerSession.deleteMany({ where: { organizerId: W.id } });

    // The new owner's old, empty account goes (its unused widgets, team rows and sessions with it).
    await tx.embedWidget.deleteMany({ where: { organizerId: B.id } });
    await tx.eventOrganizer.delete({ where: { id: B.id } });

    await tx.organizerOwnershipTransfer.update({ where: { id: t.id }, data: { previousOwnerAccountId: oldOwner.id } });
    return oldOwner.id;
  }, { timeout: 20_000 });

  return {
    workspaceId: W.id, previousOwnerAccountId, oldOwnerEmail: W.email, oldOwnerName: W.name, newOwnerEmail: B.email,
    workspaceName: found.workspace.name,
  };
}

/** Both people hear about it once it's done. */
export function sendTransferDoneEmails(r: { oldOwnerEmail: string; oldOwnerName: string; newOwnerEmail: string; workspaceName: string }) {
  sendEmailFireAndForget({
    to: r.oldOwnerEmail,
    subject: `${r.workspaceName} now has a new owner`,
    type: "security_alert",
    html: `<p>Hi ${esc(r.oldOwnerName || "there")},</p><p>${esc(r.newOwnerEmail)} accepted ownership of <strong>${esc(r.workspaceName)}</strong>. You’re now an Admin of the workspace, using your own account with the same email and password. Sign in again to continue.</p><p>If you didn’t ask for this, contact support right away.</p>`,
  });
  sendEmailFireAndForget({
    to: r.newOwnerEmail,
    subject: `You now own ${r.workspaceName} on Udyaibase Events`,
    type: "security_alert",
    html: `<p>You’re now the owner of <strong>${esc(r.workspaceName)}</strong>. Sign in with your usual email and password.</p><p>To sell paid tickets, set up payouts with your own bank details in Settings → Payment. Review the invoice details in Plans &amp; billing too.</p>`,
  });
}
