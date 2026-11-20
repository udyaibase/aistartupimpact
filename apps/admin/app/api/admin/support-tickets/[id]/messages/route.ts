import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@udyaibase/database";
import { sendEmailFireAndForget } from "@/lib/email-send";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com").replace(/\/$/, "");
const PORTAL_PATH: Record<string, string> = { EMPLOYER: "/employer/support", FOUNDER: "/founder/support", ORGANIZER: "/organizer/support" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireApiAuth(["SUPER_ADMIN", "EDITOR_IN_CHIEF"]);
  if (error) return error;

  const { body, isInternal } = await request.json();
  if (!body?.trim()) return NextResponse.json({ success: false, error: "Message body is required" }, { status: 400 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });

  const user = (session as any).user;

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: params.id,
      senderType: "ADMIN",
      senderId: user.id,
      senderName: user.name || "Support",
      body,
      isInternal: !!isInternal,
    },
  });

  if (!isInternal) {
    // The first public reply is what the reply-time promise measures.
    const data: { status?: "AWAITING_USER"; firstReplyAt?: Date } = {};
    if (ticket.status === "OPEN") data.status = "AWAITING_USER";
    if (!ticket.firstReplyAt) data.firstReplyAt = new Date();
    if (Object.keys(data).length) await prisma.supportTicket.update({ where: { id: params.id }, data });

    // Tell them: otherwise a reply sits unseen in the portal.
    const path = PORTAL_PATH[ticket.portal];
    if (path && /@/.test(ticket.submitterEmail) && !ticket.submitterEmail.endsWith(".invalid")) {
      sendEmailFireAndForget({
        to: ticket.submitterEmail,
        type: "support_reply",
        // Their email reply comes back into this ticket (the ticket number in the subject links it).
        ...(process.env.SUPPORT_INBOUND_ADDRESS ? { headers: { "Reply-To": process.env.SUPPORT_INBOUND_ADDRESS } } : {}),
        subject: `Re: ${ticket.subject} (${ticket.ticketNumber})`.replace(/[\r\n]+/g, " ").slice(0, 180),
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
<p style="margin:0 0 12px;font-size:15px">Our team replied to your ticket <strong>${esc(ticket.ticketNumber)}</strong>:</p>
<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #e5e7eb;background:#f9fafb;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(String(body).slice(0, 4000))}</blockquote>
<p style="margin:0 0 20px"><a href="${SITE}${path}/${ticket.id}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Reply in the portal</a></p>
<p style="margin:0;font-size:12px;color:#6b7280">${process.env.SUPPORT_INBOUND_ADDRESS ? "You can also just reply to this email. " : ""}Udyaibase support · Mon–Sat, 9:30 am to 6:30 pm IST</p></div>`,
      });
    }
  }

  return NextResponse.json({ success: true, message });
}
