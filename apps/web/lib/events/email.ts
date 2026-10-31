import { generateUnsubscribeToken } from "./unsubscribe";
import { eventRegistrationHtml, eventNewsletterWelcomeHtml } from "@udyaibase/utils";
import type { EventEmailData } from "@udyaibase/utils";
import { sendEmailFireAndForget } from "../email/send";
import { generateICSContent } from "./calendar";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@udyaibase.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";

export type { EventEmailData };

export async function sendRegistrationConfirmationEmail(
  email: string,
  name: string,
  data: EventEmailData
) {
  const unsubToken = await generateUnsubscribeToken(email, email);
  const unsubUrl = `${SITE_URL}/api/events/unsubscribe?token=${unsubToken}`;

  const attachments: Array<{ filename: string; content: string; contentType?: string }> = [];

  if (data.startAtIso && data.endAtIso) {
    const eventUrl = `${SITE_URL}/events/${data.eventSlug}`;
    const location = data.venueName
      ? `${data.venueName}${data.address ? `, ${data.address}` : ""}`
      : data.format === "VIRTUAL" ? "Virtual" : undefined;

    const icsContent = generateICSContent({
      title: data.eventTitle,
      description: `Registered via Udyaibase`,
      startAt: data.startAtIso,
      endAt: data.endAtIso,
      timezone: data.eventTimezone,
      location,
      url: eventUrl,
    });
    attachments.push({
      filename: "event.ics",
      content: icsContent,
      contentType: "text/calendar",
    });
  }

  sendEmailFireAndForget({
    to: email,
    from: `Udyaibase Events <${FROM_EMAIL}>`,
    subject: `You're registered! ${data.eventTitle}`,
    html: eventRegistrationHtml(name, data),
    type: "event_registration",
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    ...(attachments.length > 0 && { attachments }),
  });
}

export async function sendNewsletterWelcomeEmail(
  email: string,
  name: string,
  subscriberId: string
) {
  const unsubToken = await generateUnsubscribeToken(subscriberId, email);
  const unsubUrl = `${SITE_URL}/api/events/unsubscribe?token=${unsubToken}`;

  sendEmailFireAndForget({
    to: email,
    from: `Udyaibase Events <${FROM_EMAIL}>`,
    subject: "Welcome! You'll get AI event updates near you",
    html: eventNewsletterWelcomeHtml(name, unsubUrl),
    type: "event_newsletter_welcome",
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
