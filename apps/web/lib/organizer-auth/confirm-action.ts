import { NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { otpEmailHtml } from "@udyaibase/utils";
import { generateOTP, verifyOTP } from "@/lib/action-otp";
import { sendEmailFireAndForget } from "@/lib/email/send";
import { verifyPassword } from "./index";

/**
 * Confirms it is really the account holder before an action that can't be taken back (deactivate, delete).
 * With a password on the account: that password. Without one (Google sign-in only): a 6-digit code emailed to the
 * account's address. The first request sends the code and returns `codeToken`; the next sends both back.
 */
export async function confirmAccountHolder(
  organizer: { id: string; email: string; passwordHash: string | null },
  body: { password?: unknown; code?: unknown; codeToken?: unknown },
  action: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const typed = typeof body.password === "string" ? body.password : "";
  if (organizer.passwordHash) {
    if (!typed) return { ok: false, response: NextResponse.json({ success: false, error: "Password is required" }, { status: 400 }) };
    if (!(await verifyPassword(typed, organizer.passwordHash))) {
      return { ok: false, response: NextResponse.json({ success: false, error: "Incorrect password" }, { status: 401 }) };
    }
    return { ok: true };
  }
  // The emailed code comes in its own field, never mixed up with a password.
  const emailedCode = typeof body.code === "string" ? body.code : "";
  if (typeof body.codeToken === "string" && body.codeToken && emailedCode) {
    const check = verifyOTP(body.codeToken, emailedCode, organizer.id, action);
    if (check.valid) return { ok: true };
    return { ok: false, response: NextResponse.json({ success: false, error: check.error || "Incorrect code", codeToken: body.codeToken }, { status: 401 }) };
  }
  const { code, token } = generateOTP(organizer.id, action);
  sendEmailFireAndForget({ to: organizer.email, subject: "Your confirmation code — Udyaibase", html: otpEmailHtml(code), type: "otp" });
  return {
    ok: false,
    response: NextResponse.json({
      success: false, code: "CODE_SENT", codeToken: token,
      error: "You sign in with Google, so we emailed you a 6-digit code. Enter it in the box to confirm.",
    }, { status: 401 }),
  };
}

const ACTIVE_REGISTRATION = ["CONFIRMED", "PENDING_APPROVAL", "WAITLISTED", "PENDING_PAYMENT", "CHECKED_IN"] as const;

/**
 * Why this workspace can't be closed yet, or null. People are registered for upcoming events, or ticket money from
 * a recent event hasn't been paid out: the host cancels those events first (which tells attendees and refunds
 * tickets), or waits for the payout.
 */
export async function closeAccountProblem(organizerId: string): Promise<string | null> {
  const now = new Date();
  const upcoming = await prisma.event.findMany({
    where: {
      organizerId, deletedAt: null, endAt: { gt: now }, status: { in: ["PUBLISHED", "PENDING_REVIEW", "POSTPONED"] },
      registrations: { some: { deletedAt: null, status: { in: [...ACTIVE_REGISTRATION] } } },
    },
    select: { title: true },
    take: 4,
  });
  if (upcoming.length) {
    const names = upcoming.slice(0, 3).map((e) => `“${e.title}”`).join(", ");
    return `People are registered for ${names}${upcoming.length > 3 ? " and more" : ""}. Cancel or delete those events first, so attendees are told and any tickets are refunded.`;
  }
  const unpaid = await prisma.event.count({
    where: {
      organizerId, endAt: { gt: new Date(now.getTime() - 7 * 864e5), lte: now },
      registrations: { some: { deletedAt: null, paymentStatus: "PAID" } },
    },
  });
  if (unpaid) return "Ticket money from a recent event is still being paid out. Try again a week after the event ended.";
  return null;
}
