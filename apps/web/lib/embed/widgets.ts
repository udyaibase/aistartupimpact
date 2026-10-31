import { prisma } from "@udyaibase/database";
import type { EmbedWidget } from "@prisma/client";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { detectAccentFromWebsite } from "./accent";
import { validateAccentColor, validateAndNormalizeDomains, clampMaxEvents } from "./validation";
import { EMBED_FONTS } from "./fonts";

const FALLBACK_ACCENT = "#1f2937";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let redis: Redis | null | undefined;
export function getEmbedRedis(): Redis | null {
  if (redis !== undefined) return redis;
  redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
      : null;
  return redis;
}

/** frame-ancestors value; restricted widgets still allow our own portal preview and localhost testing. */
export function frameAncestorsFor(widget: Pick<EmbedWidget, "allowedDomains">): string {
  if (widget.allowedDomains.length === 0) return "*";
  return ["'self'", "http://localhost:*", "http://127.0.0.1:*", ...widget.allowedDomains].join(" ");
}

export async function syncWidgetCsp(widget: Pick<EmbedWidget, "id" | "active" | "allowedDomains">) {
  const r = getEmbedRedis();
  if (!r) return;
  if (widget.active) await r.set(`embed:csp:${widget.id}`, frameAncestorsFor(widget)).catch(() => {});
  else await r.del(`embed:csp:${widget.id}`).catch(() => {});
}

export async function ensureDefaultWidget(organizerId: string): Promise<EmbedWidget[]> {
  const existing = await prisma.embedWidget.findMany({
    where: { organizerId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (existing.length > 0) return existing;

  const organizer = await prisma.eventOrganizer.findUnique({
    where: { id: organizerId },
    select: { website: true },
  });
  const accent = (await detectAccentFromWebsite(organizer?.website)) || FALLBACK_ACCENT;

  // Deterministic id: concurrent first visits collide on the primary key instead of duplicating.
  const id = defaultWidgetId(organizerId);
  try {
    const widget = await prisma.embedWidget.create({
      data: { id, organizerId, name: "Website widget", isDefault: true, accentColor: accent, allowedDomains: [] },
    });
    await syncWidgetCsp(widget);
    return [widget];
  } catch (err) {
    const existingDefault = await prisma.embedWidget.findUnique({ where: { id } });
    if (existingDefault) return [existingDefault];
    throw err;
  }
}

function defaultWidgetId(organizerId: string): string {
  const h = createHash("sha256").update(`udyaibase-default-widget:${organizerId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type WidgetStatus = "paused" | "live" | "testing" | "waiting" | "stale";

export function widgetStatus(w: Pick<EmbedWidget, "active" | "firstSeenAt" | "lastSeenHost" | "codeCopiedAt" | "markedInstalledAt">): WidgetStatus {
  if (!w.active) return "paused";
  if (w.firstSeenAt) return "live";
  if (w.lastSeenHost && isLocalHost(w.lastSeenHost)) return "testing";
  const since = w.markedInstalledAt || w.codeCopiedAt;
  if (since && Date.now() - since.getTime() > STALE_AFTER_MS) return "stale";
  return "waiting";
}

export function isLocalHost(host: string): boolean {
  const h = host.split(":")[0];
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost") || h.endsWith(".test");
}

export async function getWidgetViews(widgetIds: string[], days = 30): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(widgetIds.map((id) => [id, 0]));
  const r = getEmbedRedis();
  if (!r || widgetIds.length === 0) return out;
  const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const keys = widgetIds.flatMap((id) => dates.map((d) => `embed:views:widget:${id}:${d}`));
  try {
    const values = await r.mget<(number | string | null)[]>(...keys);
    widgetIds.forEach((id, wi) => {
      for (let di = 0; di < dates.length; di++) out[id] += Number(values[wi * dates.length + di] || 0);
    });
  } catch {}
  return out;
}

export async function getWidgetRegistrations(widgetIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(widgetIds.map((id) => [id, 0]));
  if (widgetIds.length === 0) return out;
  const rows = await prisma.eventRegistration.groupBy({
    by: ["embedWidgetId"],
    where: { embedWidgetId: { in: widgetIds }, deletedAt: null },
    _count: true,
  });
  for (const r of rows) if (r.embedWidgetId) out[r.embedWidgetId] = r._count;
  return out;
}

export async function getTopReferrers(organizerId: string, widgetId?: string, take = 6) {
  const rows = await prisma.eventRegistration.groupBy({
    by: ["referrerUrl"],
    where: {
      deletedAt: null,
      registrationSource: "EMBED",
      referrerUrl: { not: null },
      ...(widgetId ? { embedWidgetId: widgetId } : { embedWidget: { organizerId } }),
    },
    _count: true,
    orderBy: { _count: { referrerUrl: "desc" } },
    take,
  });
  return rows.map((r) => ({ url: r.referrerUrl as string, count: r._count }));
}

const LAYOUTS = ["auto", "grid", "list", "compact"];
const THEMES = ["auto", "light", "dark"];
const CORNERS = ["sharp", "rounded", "pill"];
const REG_MODES = ["inline", "page"];
const ALIGNS = ["left", "center"];
const ENUMS: Record<string, { values: string[]; label: string }> = {
  buttonSize: { values: ["sm", "md", "lg"], label: "button size" },
  buttonStyle: { values: ["filled", "outline", "soft"], label: "button style" },
  cardStyle: { values: ["bordered", "elevated", "flat"], label: "card style" },
  spacing: { values: ["compact", "comfortable", "spacious"], label: "spacing" },
};
const SIZES = ["sm", "md", "lg"];
const BOOL_FIELDS = ["showCover", "showPrice", "showSpotsLeft", "showAttendeeCount", "showCategory", "showPast", "active"] as const;

export class WidgetInputError extends Error {}

/** Validates a partial widget update from the portal. Throws WidgetInputError on bad input. */
export function parseWidgetInput(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) throw new WidgetInputError("Give the widget a name.");
    data.name = name;
  }
  if (body.layout !== undefined) {
    if (!LAYOUTS.includes(String(body.layout))) throw new WidgetInputError("Unknown layout.");
    data.layout = body.layout;
  }
  if (body.darkMode !== undefined) {
    if (!THEMES.includes(String(body.darkMode))) throw new WidgetInputError("Unknown theme.");
    data.darkMode = body.darkMode;
  }
  if (body.cornerStyle !== undefined) {
    if (!CORNERS.includes(String(body.cornerStyle))) throw new WidgetInputError("Unknown corner style.");
    data.cornerStyle = body.cornerStyle;
  }
  if (body.registrationMode !== undefined) {
    if (!REG_MODES.includes(String(body.registrationMode))) throw new WidgetInputError("Unknown registration mode.");
    data.registrationMode = body.registrationMode;
  }
  if (body.accentColor !== undefined) {
    const c = String(body.accentColor);
    if (!validateAccentColor(c)) throw new WidgetInputError("Use a 6-digit hex colour like #A50F15.");
    data.accentColor = c.toLowerCase();
  }
  if (body.buttonText !== undefined) {
    const t = String(body.buttonText).trim().slice(0, 24);
    data.buttonText = t || "Register";
  }
  if (body.heading !== undefined) {
    data.heading = String(body.heading ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  }
  if (body.subheading !== undefined) {
    data.subheading = String(body.subheading ?? "").replace(/[ \t]+/g, " ").trim().slice(0, 200) || null;
  }
  if (body.headingAlign !== undefined) {
    if (!ALIGNS.includes(String(body.headingAlign))) throw new WidgetInputError("Unknown heading alignment.");
    data.headingAlign = body.headingAlign;
  }
  if (body.headingSize !== undefined) {
    if (!SIZES.includes(String(body.headingSize))) throw new WidgetInputError("Unknown heading size.");
    data.headingSize = body.headingSize;
  }
  if (body.textScale !== undefined) {
    if (!SIZES.includes(String(body.textScale))) throw new WidgetInputError("Unknown text size.");
    data.textScale = body.textScale;
  }
  if (body.fontFamily !== undefined) {
    if (!EMBED_FONTS.some((f) => f.id === body.fontFamily)) throw new WidgetInputError("Unknown font.");
    data.fontFamily = body.fontFamily;
  }
  for (const [k, rule] of Object.entries(ENUMS)) {
    if (body[k] === undefined) continue;
    if (!rule.values.includes(String(body[k]))) throw new WidgetInputError(`Unknown ${rule.label}.`);
    data[k] = body[k];
  }
  for (const f of BOOL_FIELDS) if (body[f] !== undefined) data[f] = !!body[f];
  if (body.maxEvents !== undefined) data.maxEvents = clampMaxEvents(Number(body.maxEvents));
  if (body.categories !== undefined) {
    data.categories = Array.isArray(body.categories) ? body.categories.map(String).slice(0, 20) : [];
  }
  if (body.eventIds !== undefined) {
    data.eventIds = Array.isArray(body.eventIds) ? body.eventIds.map(String).slice(0, 50) : [];
  }
  if (body.allowedDomains !== undefined) {
    try {
      data.allowedDomains = Array.from(new Set(validateAndNormalizeDomains(
        Array.isArray(body.allowedDomains) ? body.allowedDomains.map(String) : [],
      ))).slice(0, 20);
    } catch (e) {
      throw new WidgetInputError((e as Error).message.replace(/^Invalid domain: /, "Not a valid domain: "));
    }
  }
  if (body.platform !== undefined) data.platform = body.platform ? String(body.platform).slice(0, 24) : null;
  data.showPoweredBy = true;
  return data;
}
