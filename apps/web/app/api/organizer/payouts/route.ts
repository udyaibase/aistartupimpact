import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { apiRateLimit, authRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { confirmAccountHolder } from "@/lib/organizer-auth/confirm-action";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { refreshPayoutStatus, setUpPayouts, validatePayoutInput } from "@/lib/events/payouts";
import { RazorpayApiError } from "@/lib/billing/razorpay";
import { ticketFeePct } from "@/lib/events/tickets";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = "force-dynamic";

async function status(organizerId: string, viewer: { role: string }) {
  const o = await prisma.eventOrganizer.findUnique({
    where: { id: organizerId },
    select: { payoutStatus: true, payoutBankLast4: true, payoutBeneficiary: true, payoutNote: true, payoutUpdatedAt: true, payoutAccountId: true, passwordHash: true },
  });
  return {
    // Only the workspace owner may set or change where ticket money goes, and confirms with their password.
    canEdit: viewer.role === "OWNER", needsPassword: !!o?.passwordHash,
    status: o?.payoutStatus ?? "NOT_STARTED", bankLast4: o?.payoutBankLast4 ?? null, beneficiary: o?.payoutBeneficiary ?? null,
    note: o?.payoutNote ?? null, updatedAt: o?.payoutUpdatedAt ?? null, started: !!o?.payoutAccountId, feePct: ticketFeePct(),
  };
}

/** Payout (Razorpay Route) status; `?refresh=1` re-checks KYC review with Razorpay. */
export async function GET(request: NextRequest) {
  const result = await requirePermission("billing");
  if (result instanceof NextResponse) return result;
  if (request.nextUrl.searchParams.get("refresh")) await refreshPayoutStatus(result.organizerId).catch(() => null);
  return NextResponse.json({ success: true, payouts: await status(result.organizerId, result) });
}

/** Set up payouts: business and bank details go straight to Razorpay (only the last 4 digits are kept). */
export async function POST(request: NextRequest) {
  const result = await requirePermission("billing");
  if (result instanceof NextResponse) return result;
  // Where ticket money is paid: the owner only, never a teammate (whatever their role).
  if (result.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Only the workspace owner can set up or change payouts." }, { status: 403 });
  }
  const { success } = await checkRateLimit(apiRateLimit, `payouts:${result.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  const body = await request.json().catch(() => ({}));

  const parsed = validatePayoutInput(body);
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error, field: parsed.field }, { status: 400 });

  // Confirm it's really the owner, so an unattended, signed-in browser can't redirect payouts: the account password,
  // or for Google-only accounts a code emailed to the owner (the first submit sends it).
  const owner = await prisma.eventOrganizer.findUnique({ where: { id: result.organizerId }, select: { id: true, email: true, name: true, passwordHash: true } });
  if (!owner) return NextResponse.json({ success: false, error: "Account not found." }, { status: 404 });
  const { success: mayTry } = await checkRateLimit(authRateLimit, `payouts-password:${result.organizerId}`);
  if (!mayTry) return NextResponse.json({ success: false, error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const confirmed = await confirmAccountHolder(owner, { password: body.password, code: body.code, codeToken: body.codeToken }, "organizer-payouts");
  if (!confirmed.ok) return confirmed.response;

  try {
    await setUpPayouts(result.organizerId, parsed.data);
    await logOrganizerActivity(result.organizerId, "payout_details_changed", { actor: organizerActor(result), request });
    // The owner always hears about it, in case it wasn't them.
    sendEmailFireAndForget({
      to: owner.email,
      subject: "Your payout bank details were updated — Udyaibase",
      html: `<p>Hi ${escapeHtml(owner.name || "there")},</p><p>The bank details used for ticket payouts on your Udyaibase organizer account were just updated.</p><p>If this was you, there is nothing to do. If it wasn't, change your password now and contact support.</p>`,
      type: "security_alert",
    });
    return NextResponse.json({ success: true, payouts: await status(result.organizerId, result) });
  } catch (err) {
    const msg = err instanceof RazorpayApiError ? err.message : "Could not set up payouts. Try again.";
    return NextResponse.json({ success: false, error: msg, field: err instanceof RazorpayApiError ? err.field : undefined }, { status: 400 });
  }
}

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
