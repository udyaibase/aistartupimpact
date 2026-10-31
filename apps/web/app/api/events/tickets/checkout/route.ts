import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { registrationRateLimit } from "@/lib/event-rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { startTicketCheckout, TicketError } from "@/lib/events/tickets";

export const dynamic = "force-dynamic";

/** Start buying a paid ticket: holds a seat for a few minutes and returns a Razorpay order. */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(registrationRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ success: false, error: "Too many requests. Please wait and try again." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  if (!body.turnstileToken || !(await verifyTurnstileToken(body.turnstileToken))) {
    return NextResponse.json({ success: false, error: "Human verification failed. Please try again." }, { status: 403 });
  }
  const { eventId, ticketTierId, name, email } = body;
  if (!eventId || !ticketTierId || !name?.trim() || !email) return NextResponse.json({ success: false, error: "Name, email and a ticket are required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ success: false, error: "Invalid email address." }, { status: 400 });
  try {
    const order = await startTicketCheckout({
      eventId, ticketTierId, name, email, phone: body.phone, company: body.company, occupation: body.occupation, locationCity: body.locationCity,
      newsletterConsent: !!body.newsletterConsent, whatsappConsent: !!body.whatsappConsent,
      answers: Array.isArray(body.answers) ? body.answers : [], registrationSource: body.source === "EMBED" ? "EMBED" : "WEBSITE",
    });
    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    if (err instanceof TicketError) return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    console.error("[ticket checkout]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
