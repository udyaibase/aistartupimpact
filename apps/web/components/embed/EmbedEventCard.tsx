"use client";

import type { EmbedEvent, WidgetConfig } from "./EmbedWidgetView";
import {
  eventState, spotsLeft, formatDateParts, formatWhen, formatWhere, priceLabel, categoryLabel,
  type EventState,
} from "./embed-utils";

interface Props {
  event: EmbedEvent;
  layout: "grid" | "list" | "compact";
  config: WidgetConfig;
  onOpen: () => void;
}

function buttonLabel(state: EventState, config: WidgetConfig, approval: boolean): string {
  if (state === "past") return "View event";
  if (state === "closed") return "Registration closed";
  if (state === "sold-out") return "Join waitlist";
  if (approval && config.buttonText === "Register") return "Request to join";
  return config.buttonText || "Register";
}

function Badge({ state, event, config }: { state: EventState; event: EmbedEvent; config: WidgetConfig }) {
  const items: { text: string; tone: "warn" | "neutral" | "accent" }[] = [];
  if (state === "sold-out") items.push({ text: "Sold out", tone: "neutral" });
  if (state === "few-left" && config.showSpotsLeft) {
    const n = spotsLeft(event);
    items.push({ text: n === 1 ? "1 spot left" : `${n} spots left`, tone: "warn" });
  }
  if (state === "past") items.push({ text: "Ended", tone: "neutral" });
  if (event.approvalRequired && state !== "past" && state !== "closed") items.push({ text: "Approval required", tone: "neutral" });
  if (items.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((b) => (
        <span
          key={b.text}
          className="inline-flex items-center px-2 py-0.5 text-[0.75rem] font-semibold leading-5"
          style={{
            borderRadius: "999px",
            background: b.tone === "warn" ? "#fef3c7" : "var(--w-subtle)",
            color: b.tone === "warn" ? "#92400e" : "var(--w-muted)",
          }}
        >
          {b.text}
        </span>
      ))}
    </span>
  );
}

const MIN_ATTENDEES = 5;

function formatCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("en-IN");
}

/** Neutral avatar stack: never real attendee photos or names, since the widget runs on third-party sites. */
function Going({ event, state, config, className = "" }: { event: EmbedEvent; state: EventState; config: WidgetConfig; className?: string }) {
  const n = event.registrationCount;
  if (!config.showAttendeeCount || n < MIN_ATTENDEES) return null;
  const tints = [70, 45, 25];
  return (
    <p className={`flex items-center gap-2 text-sm ${className}`} style={{ color: "var(--w-muted)" }}>
      <span aria-hidden className="flex -space-x-2">
        {tints.map((t) => (
          <span
            key={t}
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: `color-mix(in srgb, var(--embed-accent) ${t}%, var(--w-surface))`,
              boxShadow: "0 0 0 2px var(--w-surface)",
              color: t >= 45 ? "var(--embed-on-accent)" : "var(--w-text)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7Z" /></svg>
          </span>
        ))}
      </span>
      <span>
        <span className="font-semibold" style={{ color: "var(--w-text)" }}>{formatCount(n)}</span>
        {state === "past" ? " attended" : " going"}
      </span>
    </p>
  );
}

function DateBlock({ event, size = "md" }: { event: EmbedEvent; size?: "sm" | "md" }) {
  const p = formatDateParts(event.startAt, event.timezone);
  const dim = size === "sm" ? "w-12 h-12" : "w-14 h-14";
  return (
    <div
      aria-hidden
      className={`${dim} shrink-0 flex flex-col items-center justify-center border`}
      style={{ borderRadius: "var(--r-control)", borderColor: "var(--w-border)", background: "var(--w-surface)" }}
    >
      <span className="text-[0.6875rem] font-bold leading-none" style={{ color: "var(--w-muted)" }}>{p.month}</span>
      <span className={`${size === "sm" ? "text-lg" : "text-xl"} font-bold leading-tight`}>{p.day}</span>
    </div>
  );
}

export default function EmbedEventCard({ event, layout, config, onOpen }: Props) {
  const state = eventState(event);
  const label = buttonLabel(state, config, event.approvalRequired);
  const price = config.showPrice ? priceLabel(event) : null;
  const disabled = state === "closed";
  const secondary = state === "sold-out" || state === "past";
  const muted = state === "past" || state === "closed";
  const accessibleName = `${label}: ${event.title}`;

  const button = (full = false) => (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={accessibleName}
      className={`embed-focus ${secondary || disabled ? "embed-btn-secondary" : "embed-btn"} embed-btn-size font-semibold whitespace-nowrap transition ${full ? "w-full" : ""}`}
    >
      {label}
    </button>
  );

  if (layout === "compact") {
    return (
      <article className="flex items-center gap-3 px-4 py-3" style={{ opacity: muted ? 0.75 : 1 }}>
        <DateBlock event={event} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.9375rem] font-semibold leading-snug truncate">{event.title}</h3>
          <p className="text-[0.8125rem] truncate" style={{ color: "var(--w-muted)" }}>
            {formatDateParts(event.startAt, event.timezone).time} · {formatWhere(event)}
            {price ? ` · ${price}` : ""}
          </p>
        </div>
        <div className="hidden sm:block"><Badge state={state} event={event} config={config} /></div>
        {button()}
      </article>
    );
  }

  const cover = config.showCover && event.coverImageUrl;

  if (layout === "grid") {
    return (
      <article
        className="h-full flex flex-col overflow-hidden border"
        style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)", opacity: muted ? 0.75 : 1 }}
      >
        {cover ? (
          <img src={event.coverImageUrl!} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover" style={{ background: "var(--w-subtle)" }} />
        ) : null}
        <div className="flex-1 flex flex-col p-4 gap-2">
          <div className="flex items-start gap-3">
            {!cover && <DateBlock event={event} size="sm" />}
            <div className="min-w-0">
              {config.showCategory && (
                <p className="text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: "var(--w-muted)" }}>
                  {categoryLabel(event.category)}
                </p>
              )}
              <h3 className="text-base font-semibold leading-snug line-clamp-2">{event.title}</h3>
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--w-muted)" }}>
            <span className="block">{formatWhen(event)}</span>
            <span className="block truncate">{formatWhere(event)}</span>
          </p>
          <Badge state={state} event={event} config={config} />
          <Going event={event} state={state} config={config} />
          <div className="mt-auto pt-2 flex items-center justify-between gap-3">
            {price ? <span className="text-sm font-semibold">{price}</span> : <span />}
            {button()}
          </div>
        </div>
      </article>
    );
  }

  const parts = formatDateParts(event.startAt, event.timezone);

  return (
    <article
      className="overflow-hidden border flex flex-col sm:flex-row sm:items-center sm:gap-4 sm:p-4"
      style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)", opacity: muted ? 0.75 : 1 }}
    >
      {cover && (
        <div className="relative shrink-0 w-full aspect-[16/9] sm:w-28 sm:h-[72px] sm:aspect-auto">
          <img
            src={event.coverImageUrl!}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover sm:rounded-[var(--r-control)]"
            style={{ background: "var(--w-subtle)" }}
          />
          <span
            aria-hidden
            className="sm:hidden absolute top-3 left-3 flex flex-col items-center justify-center w-12 h-12 shadow-sm"
            style={{ borderRadius: "var(--r-control)", background: "var(--w-surface)", color: "var(--w-text)" }}
          >
            <span className="text-[0.625rem] font-bold leading-none" style={{ color: "var(--w-muted)" }}>{parts.month}</span>
            <span className="text-lg font-bold leading-tight">{parts.day}</span>
          </span>
        </div>
      )}

      <div className="flex items-start gap-4 min-w-0 flex-1 p-4 sm:p-0">
        {!cover && <DateBlock event={event} />}
        <div className="min-w-0 flex-1">
          {config.showCategory && (
            <p className="sm:hidden text-[0.75rem] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--w-muted)" }}>
              {categoryLabel(event.category)}
            </p>
          )}
          <h3 className="text-base font-semibold leading-snug line-clamp-2">{event.title}</h3>
          <p className="flex items-center gap-1.5 text-sm mt-1.5 sm:mt-0.5" style={{ color: "var(--w-muted)" }}>
            <svg aria-hidden className="sm:hidden shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            <span>{formatWhen(event)}</span>
          </p>
          <p className="flex items-center gap-1.5 text-sm mt-0.5 min-w-0" style={{ color: "var(--w-muted)" }}>
            <svg aria-hidden className="sm:hidden shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
            <span className="truncate">{formatWhere(event)}</span>
            {price ? <span style={{ color: "var(--w-text)" }} className="hidden sm:inline font-semibold shrink-0"> · {price}</span> : null}
          </p>
          <div className="mt-2 sm:mt-1.5"><Badge state={state} event={event} config={config} /></div>
          <Going event={event} state={state} config={config} className="mt-2 sm:mt-1.5" />
        </div>
      </div>

      <div className="px-4 pb-4 sm:p-0 sm:shrink-0 flex items-center gap-3">
        {price ? <span className="sm:hidden text-base font-semibold shrink-0">{price}</span> : null}
        <div className="flex-1 sm:flex-none [&>button]:w-full sm:[&>button]:w-auto">{button(false)}</div>
      </div>
    </article>
  );
}
