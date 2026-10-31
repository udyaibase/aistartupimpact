import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { registrationRateLimit, embedRegistrationRateLimit } from "@/lib/event-rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { registerForEvent, RegistrationError } from "@/lib/events/register-event";

export const dynamic = "force-dynamic";

function fail(error: string, status: number, code?: string, field?: string) {
  return NextResponse.json({ success: false, error, code, field }, { status });
}

function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function cleanUrl(v: unknown): string | undefined {
  const s = clean(v, 500);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? `${u.origin}${u.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);

  try {
    const body = await request.json();
    const widgetId = clean(body.widgetId, 64);
    const eventId = clean(body.eventId, 64);
    const name = clean(body.name, 120);
    const email = clean(body.email, 254)?.toLowerCase();
    const phone = clean(body.phone, 24);

    if (!widgetId || !eventId) return fail("Something went wrong. Reload the page and try again.", 400);
    if (!name) return fail("Enter your name.", 400, "invalid", "name");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return fail("Enter a valid email, like name@company.com.", 400, "invalid", "email");
    }
    if (phone && !/^\+\d{8,16}$/.test(phone.replace(/[\s-]/g, ""))) {
      return fail("Enter a valid phone number.", 400, "invalid", "phone");
    }
    if (!body.turnstileToken) return fail("Complete the security check, then try again.", 403, "captcha");

    const [ipCheck, widgetCheck] = await Promise.all([
      checkRateLimit(registrationRateLimit, identifier),
      checkRateLimit(embedRegistrationRateLimit, widgetId),
    ]);
    if (!ipCheck.success || !widgetCheck.success) {
      return fail("Too many attempts. Wait a minute and try again.", 429, "rate_limited");
    }

    if (!(await verifyTurnstileToken(body.turnstileToken))) {
      return fail("The security check expired. Try again.", 403, "captcha");
    }

    const widget = await prisma.embedWidget.findUnique({ where: { id: widgetId, active: true } });
    if (!widget) return fail("Registration through this site is paused.", 404, "not_found");

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, ticketTiers: { select: { id: true, priceCents: true } } },
    });
    if (!event || event.organizerId !== widget.organizerId) {
      return fail("This event is no longer available.", 404, "not_found");
    }

    const ticketTierId = clean(body.ticketTierId, 64);
    if (ticketTierId) {
      const tier = event.ticketTiers.find((t) => t.id === ticketTierId);
      if (!tier) return fail("That ticket type is no longer available.", 400, "invalid", "ticketTierId");
      if (tier.priceCents > 0) return fail("Paid tickets are completed on the checkout page.", 400, "paid");
    }

    const answers = Array.isArray(body.answers)
      ? body.answers
          .filter((a: any) => typeof a?.questionId === "string" && typeof a?.answerText === "string")
          .slice(0, 50)
          .map((a: any) => ({ questionId: a.questionId, answerText: a.answerText.slice(0, 2000) }))
      : undefined;

    const result = await registerForEvent({
      eventId,
      name,
      email,
      phone,
      ticketTierId,
      answers,
      whatsappConsent: !!phone && body.whatsappConsent === true,
      registrationSource: "EMBED",
      embedWidgetId: widget.id,
      referrerUrl: cleanUrl(body.referrerUrl),
      utmSource: clean(body.utmSource, 100),
      utmMedium: clean(body.utmMedium, 100),
      utmCampaign: clean(body.utmCampaign, 100),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof RegistrationError) {
      return fail(error.message, error.statusCode, error.code);
    }
    console.error("Embed registration error:", error);
    return fail("We couldn't complete your registration. Try again in a moment.", 500);
  }
}
