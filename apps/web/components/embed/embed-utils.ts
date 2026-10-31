import type { EmbedEvent, WidgetConfig } from "./EmbedWidgetView";

export type EventState = "open" | "few-left" | "sold-out" | "closed" | "past";

export function eventState(e: EmbedEvent, now = Date.now()): EventState {
  if (new Date(e.endAt).getTime() < now) return "past";
  if (e.registrationDeadline && new Date(e.registrationDeadline).getTime() < now) return "closed";
  if (e.capacity && e.registrationCount >= e.capacity) return "sold-out";
  if (e.capacity && spotsLeft(e) <= Math.max(5, Math.ceil(e.capacity * 0.1))) return "few-left";
  return "open";
}

export function spotsLeft(e: EmbedEvent): number {
  return e.capacity ? Math.max(0, e.capacity - e.registrationCount) : Infinity;
}

export function formatDateParts(iso: string, timezone: string) {
  const d = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-IN", { timeZone: timezone, ...opts }).format(d);
  return {
    month: part({ month: "short" }).toUpperCase(),
    day: part({ day: "numeric" }),
    weekday: part({ weekday: "short" }),
    date: part({ weekday: "short", day: "numeric", month: "short" }),
    time: part({ hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" })
      .replace(/\s?(am|pm)/i, (m) => m.toUpperCase()),
  };
}

export function formatWhen(e: EmbedEvent): string {
  const p = formatDateParts(e.startAt, e.timezone);
  return `${p.date} · ${p.time}`;
}

export function formatWhere(e: EmbedEvent): string {
  if (e.format === "VIRTUAL") return "Online";
  const place = e.venueName || e.address?.split(",").slice(-2).join(",").trim() || "Venue to be announced";
  return e.format === "HYBRID" ? `${place} + Online` : place;
}

export function formatRupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function priceLabel(e: EmbedEvent): string | null {
  const tiers = e.ticketTiers;
  if (tiers.length === 0) return "Free";
  const prices = tiers.map((t) => t.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === 0) return "Free";
  if (min === max) return formatRupees(min);
  return min === 0 ? `Free – ${formatRupees(max)}` : `From ${formatRupees(min)}`;
}

export function categoryLabel(c: string): string {
  return c
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/** Picks black or white text for the accent so buttons meet WCAG AA. */
export function onAccent(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? "#ffffff" : "#111111";
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Accent as text on the card surface, falling back to body text when contrast is under 4.5:1. */
export function accentText(accent: string, surface: string, fallback: string): string {
  const a = luminance(accent), b = luminance(surface);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio >= 4.5 ? accent : fallback;
}

export const BUTTON_SIZES = {
  sm: { h: "36px", px: "0.875rem", fs: "0.8125rem" },
  md: { h: "44px", px: "1rem", fs: "0.875rem" },
  lg: { h: "52px", px: "1.5rem", fs: "1rem" },
} as const;

export const SPACING = {
  compact: { list: "0.5rem", grid: "0.75rem" },
  comfortable: { list: "0.75rem", grid: "1rem" },
  spacious: { list: "1.25rem", grid: "1.5rem" },
} as const;

export function radii(style: WidgetConfig["cornerStyle"]) {
  if (style === "sharp") return { card: "4px", control: "4px", button: "4px" };
  if (style === "pill") return { card: "18px", control: "12px", button: "999px" };
  return { card: "12px", control: "8px", button: "8px" };
}
