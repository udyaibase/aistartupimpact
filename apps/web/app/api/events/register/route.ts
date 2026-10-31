import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { registrationRateLimit } from "@/lib/event-rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { registerForEvent, RegistrationError } from "@/lib/events/register-event";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(registrationRateLimit, identifier);
  if (!success) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please wait and try again." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();

    // Turnstile verification (required)
    if (!body.turnstileToken) {
      return NextResponse.json(
        { success: false, error: "CAPTCHA verification required." },
        { status: 403 }
      );
    }
    const isHuman = await verifyTurnstileToken(body.turnstileToken);
    if (!isHuman) {
      return NextResponse.json(
        { success: false, error: "Human verification failed. Please try again." },
        { status: 403 }
      );
    }

    const { eventId, name, email, phone, company, role, occupation, locationCity, newsletterConsent, whatsappConsent, ticketTierId, answers } = body;

    if (!eventId || !name || !email) {
      return NextResponse.json(
        { success: false, error: "Name and email are required." },
        { status: 400 }
      );
    }

    // Length cap plus dot-separated domain labels: the pattern can't backtrack on long input.
    if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address." },
        { status: 400 }
      );
    }

    const result = await registerForEvent({
      eventId, name, email, phone, company, role, occupation,
      ticketTierId, answers, newsletterConsent, whatsappConsent, locationCity,
      registrationSource: "WEBSITE",
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof RegistrationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Event registration error:", error);
    return NextResponse.json(
      { success: false, error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
