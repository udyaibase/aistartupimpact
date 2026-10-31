/**
 * Calendar utilities for event registration.
 * Generates Google Calendar links and .ics file content.
 */

interface CalendarEventData {
  title: string;
  description: string;
  startAt: string; // ISO datetime
  endAt: string; // ISO datetime
  timezone: string;
  location?: string; // venue name + address, or "Virtual"
  url: string; // event page URL
}

/**
 * Generate a Google Calendar "Add Event" URL.
 * Opens Google Calendar with pre-filled event details.
 */
export function generateGoogleCalendarUrl(data: CalendarEventData): string {
  const start = formatDateForGoogle(data.startAt);
  const end = formatDateForGoogle(data.endAt);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: data.title,
    dates: `${start}/${end}`,
    details: `${data.description}\n\nEvent page: ${data.url}`,
    ctz: data.timezone,
  });

  if (data.location) {
    params.set("location", data.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate .ics file content for Apple Calendar / Outlook.
 * Returns a string that can be served as a downloadable file.
 */
export function generateICSContent(data: CalendarEventData): string {
  const uid = `${Date.now()}-${crypto.randomUUID()}@udyaibase.com`;
  const now = formatDateForICS(new Date().toISOString());
  const start = formatDateForICS(data.startAt);
  const end = formatDateForICS(data.endAt);

  const description = escapeICS(
    `${data.description}\\n\\nEvent page: ${data.url}`
  );
  const summary = escapeICS(data.title);
  const location = data.location ? escapeICS(data.location) : "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Udyaibase//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${data.timezone}:${start}`,
    `DTEND;TZID=${data.timezone}:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    location ? `LOCATION:${location}` : "",
    `URL:${data.url}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary} starts in 1 hour`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary} is tomorrow`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

// ─── Helpers ────────────────────────────────────────

/**
 * Format ISO date to Google Calendar format: 20250115T093000Z
 */
function formatDateForGoogle(isoDate: string): string {
  return new Date(isoDate)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * Format ISO date to ICS local time format: 20250115T093000
 * (without Z suffix — timezone is specified via TZID)
 */
function formatDateForICS(isoDate: string): string {
  const d = new Date(isoDate);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

/**
 * Escape special characters for ICS format.
 */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function generateOutlookCalendarUrl(data: CalendarEventData): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: data.title,
    startdt: new Date(data.startAt).toISOString(),
    enddt: new Date(data.endAt).toISOString(),
    body: `${data.description}\n\nEvent page: ${data.url}`,
  });
  if (data.location) params.set("location", data.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
