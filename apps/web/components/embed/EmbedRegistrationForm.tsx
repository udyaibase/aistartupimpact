"use client";

import { useEffect, useId, useRef, useState } from "react";
import TurnstileWidget from "@/components/shared/TurnstileWidget";
import { generateGoogleCalendarUrl, generateOutlookCalendarUrl } from "@/lib/events/calendar";
import { eventPageUrl, type Attribution, type EmbedEvent } from "./EmbedWidgetView";
import { eventState, formatRupees, formatWhen, formatWhere } from "./embed-utils";
import { availableTiers, CHECKBOX_NO, CHECKBOX_YES, COUNTRY_CODES, formatPhone, OCCUPATIONS, phoneProblem } from "@/lib/events/registration-fields";

interface Props {
  event: EmbedEvent;
  widgetId: string;
  organizerName: string;
  attribution: Attribution;
  onBack: () => void;
}

type Outcome =
  | { kind: "CONFIRMED" | "PENDING_APPROVAL"; email: string }
  | { kind: "WAITLISTED"; email: string; position?: number }
  | { kind: "ALREADY"; email: string }
  | { kind: "CLOSED" }
  | { kind: "PAYMENT" };

const HAS_CAPTCHA = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function EmbedRegistrationForm({ event, widgetId, organizerName, attribution, onBack }: Props) {
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const state = eventState(event);
  const now = Date.now();

  const tiers = availableTiers(event.ticketTiers, now);

  const [outcome, setOutcome] = useState<Outcome | null>(state === "closed" ? { kind: "CLOSED" } : null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  // Consent must be an active choice, so this starts unticked (same as the event page).
  const [whatsapp, setWhatsapp] = useState(false);
  const [company, setCompany] = useState("");
  const [occupation, setOccupation] = useState("");
  const [tierId, setTierId] = useState(tiers[0]?.id || "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [token, setToken] = useState(HAS_CAPTCHA ? "" : "no-captcha");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedTier = tiers.find((t) => t.id === tierId);
  const isPaid = !!selectedTier && selectedTier.priceCents > 0;
  const isWaitlist = state === "sold-out";

  useEffect(() => {
    headingRef.current?.focus();
  }, [outcome]);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = "Enter a valid email, like name@company.com.";
    const pp = phoneProblem(countryCode, phone);
    if (pp) e.phone = pp;
    for (const q of event.customQuestions) {
      const a = answers[q.id]?.trim();
      if (q.required && (!a || (q.questionType === "CHECKBOX" && a !== CHECKBOX_YES))) e[`q_${q.id}`] = "This question is required.";
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (isPaid) {
      window.open(eventPageUrl(event, attribution, { tier: tierId }), "udyaibase_checkout", "popup,width=520,height=760");
      setOutcome({ kind: "PAYMENT" });
      return;
    }

    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) {
      const first = Object.keys(v)[0];
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    if (!token) {
      setFormError("Complete the security check above the button.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/embed/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetId,
          eventId: event.id,
          turnstileToken: token,
          name: name.trim(),
          email: email.trim(),
          phone: formatPhone(countryCode, phone) || undefined,
          company: company.trim() || undefined,
          occupation: occupation || undefined,
          whatsappConsent: !!phone && whatsapp,
          ticketTierId: tierId || undefined,
          answers: Object.entries(answers)
            .filter(([, val]) => val.trim())  // unticked yes/no questions are saved as "No" by the server
            .map(([questionId, answerText]) => ({ questionId, answerText })),
          referrerUrl: attribution.referrerUrl,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        const s = data.data.status;
        const em = email.trim();
        if (s === "WAITLISTED") setOutcome({ kind: "WAITLISTED", email: em, position: data.data.waitlistPosition });
        else if (s === "PENDING_APPROVAL") setOutcome({ kind: "PENDING_APPROVAL", email: em });
        else setOutcome({ kind: "CONFIRMED", email: em });
        return;
      }
      if (data.code === "already_registered") return setOutcome({ kind: "ALREADY", email: email.trim() });
      if (data.code === "closed") return setOutcome({ kind: "CLOSED" });
      if (data.field) {
        setErrors({ [data.field]: data.error });
        document.getElementById(`${uid}-${data.field}`)?.focus();
        return;
      }
      setFormError(data.error || "We couldn't complete your registration. Try again in a moment.");
    } catch {
      setFormError("You seem to be offline. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <div className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="embed-focus -ml-2 mb-2 inline-flex items-center gap-1.5 min-h-[44px] px-2 text-sm font-medium"
        style={{ color: "var(--w-muted)", borderRadius: "var(--r-control)" }}
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        All events
      </button>
      <EventSummary event={event} />
    </div>
  );

  if (outcome) {
    return (
      <div
        className="p-5 sm:p-6 border"
        style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}
      >
        {header}
        <OutcomeView outcome={outcome} event={event} organizerName={organizerName} headingRef={headingRef} onBack={onBack}
          onRetry={() => { setOutcome(null); setEmail(""); }} />
      </div>
    );
  }

  const field = (id: string) => ({
    id: `${uid}-${id}`,
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? `${uid}-${id}-err` : undefined,
  });
  const err = (id: string) =>
    errors[id] ? <p id={`${uid}-${id}-err`} className="mt-1 text-[0.8125rem]" style={{ color: "#dc2626" }}>{errors[id]}</p> : null;
  const labelCls = "block text-sm font-medium mb-1.5";

  return (
    <div className="p-5 sm:p-6 border" style={{ borderRadius: "var(--r-card)", borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>
      {header}
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-semibold mb-1 outline-none">
        {isWaitlist ? "Join the waitlist" : event.approvalRequired ? "Request to join" : "Register"}
      </h3>
      <p className="text-sm mb-5" style={{ color: "var(--w-muted)" }}>
        {isWaitlist
          ? "This event is full. Join the waitlist and we'll email you if a spot opens."
          : event.approvalRequired
            ? `${organizerName} reviews every request. You'll hear back by email.`
            : "Takes under a minute. Your ticket arrives by email."}
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {tiers.length > 1 && (
          <fieldset>
            <legend className={labelCls}>Ticket</legend>
            <div className="space-y-2">
              {tiers.map((t) => {
                const checked = tierId === t.id;
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 min-h-[48px] px-3 py-2 border cursor-pointer"
                    style={{
                      borderRadius: "var(--r-control)",
                      borderColor: checked ? "var(--embed-accent)" : "var(--w-border)",
                      boxShadow: checked ? "0 0 0 1px var(--embed-accent)" : undefined,
                    }}
                  >
                    <input type="radio" name="tier" value={t.id} checked={checked} onChange={() => setTierId(t.id)}
                      className="w-4 h-4" style={{ accentColor: "var(--embed-accent)" }} />
                    <span className="flex-1 text-[0.9375rem]">{t.name}</span>
                    <span className="text-[0.9375rem] font-semibold">{t.priceCents > 0 ? formatRupees(t.priceCents) : "Free"}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {!isPaid && (
          <>
            <div>
              <label htmlFor={`${uid}-name`} className={labelCls}>Full name</label>
              <input {...field("name")} className="embed-input" autoComplete="name" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" />
              {err("name")}
            </div>

            <div>
              <label htmlFor={`${uid}-email`} className={labelCls}>Email</label>
              <input {...field("email")} type="email" inputMode="email" autoComplete="email" className="embed-input"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@company.com" />
              {err("email")}
            </div>

            <div>
              <label htmlFor={`${uid}-phone`} className={labelCls}>
                Phone <span className="font-normal" style={{ color: "var(--w-muted)" }}>(optional)</span>
              </label>
              <div className="flex gap-2">
                <select aria-label="Country code" className="embed-input !w-[104px] shrink-0" value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input {...field("phone")} type="tel" inputMode="tel" autoComplete="tel-national" className="embed-input"
                  value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
              </div>
              {err("phone")}
              {phone.replace(/\D/g, "").length >= 6 && (
                <label className="mt-2 flex items-start gap-2.5 min-h-[44px] py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0" style={{ accentColor: "var(--embed-accent)" }} />
                  <span>Send me reminders on WhatsApp</span>
                </label>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${uid}-company`} className={labelCls}>
                  Company <span className="font-normal" style={{ color: "var(--w-muted)" }}>(optional)</span>
                </label>
                <input {...field("company")} className="embed-input" autoComplete="organization" value={company}
                  onChange={(e) => setCompany(e.target.value)} placeholder="Where you work or study" maxLength={100} />
                {err("company")}
              </div>
              <div>
                <label htmlFor={`${uid}-occupation`} className={labelCls}>
                  Occupation <span className="font-normal" style={{ color: "var(--w-muted)" }}>(optional)</span>
                </label>
                <select {...field("occupation")} className="embed-input" value={occupation} onChange={(e) => setOccupation(e.target.value)}>
                  <option value="">Choose one</option>
                  {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {err("occupation")}
              </div>
            </div>

            {event.customQuestions.map((q) => {
              const id = `q_${q.id}`;
              const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
              const optional = !q.required ? <span className="font-normal" style={{ color: "var(--w-muted)" }}> (optional)</span> : null;
              if (q.questionType === "CHECKBOX") {
                return (
                  <div key={q.id}>
                    <label className="flex items-start gap-2.5 min-h-[44px] py-2 text-[0.9375rem] cursor-pointer">
                      <input {...field(id)} type="checkbox" checked={answers[q.id] === CHECKBOX_YES}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.checked ? CHECKBOX_YES : CHECKBOX_NO }))}
                        className="mt-0.5 w-4 h-4 shrink-0" style={{ accentColor: "var(--embed-accent)" }} />
                      <span>{q.questionText}{optional}</span>
                    </label>
                    {err(id)}
                  </div>
                );
              }
              return (
                <div key={q.id}>
                  <label htmlFor={`${uid}-${id}`} className={labelCls}>{q.questionText}{optional}</label>
                  {q.questionType === "SELECT" ? (
                    <select {...field(id)} className="embed-input" value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}>
                      <option value="">Choose one</option>
                      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input {...field(id)} className="embed-input" value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                  )}
                  {err(id)}
                </div>
              );
            })}

            {HAS_CAPTCHA && <TurnstileWidget onSuccess={setToken} onExpire={() => setToken("")} onError={() => setToken("")} />}

            <p className="text-[0.8125rem]" style={{ color: "var(--w-muted)" }}>
              By registering, you agree to share your details with {organizerName}, who will use them to manage this event.
              Processed by Udyaibase under its{" "}
              <a href="/privacy" target="_blank" rel="noopener" className="embed-focus underline">Privacy Policy</a>.
            </p>
          </>
        )}

        {formError && (
          <p role="alert" className="text-sm px-3 py-2.5" style={{ color: "#991b1b", background: "#fef2f2", borderRadius: "var(--r-control)" }}>
            {formError}
          </p>
        )}

        <button type="submit" disabled={submitting}
          className="embed-focus embed-btn embed-btn-size w-full font-semibold inline-flex items-center justify-center gap-2">
          {submitting && <span aria-hidden className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
          {submitting
            ? "Registering…"
            : isPaid
              ? `Continue to payment · ${formatRupees(selectedTier!.priceCents)}`
              : isWaitlist
                ? "Join waitlist"
                : event.approvalRequired
                  ? "Send request"
                  : "Register"}
        </button>
        {isPaid && (
          <p className="text-[0.8125rem] text-center" style={{ color: "var(--w-muted)" }}>
            Payment opens securely on udyaibase.com in a new window.
          </p>
        )}
      </form>
    </div>
  );
}

function EventSummary({ event }: { event: EmbedEvent }) {
  return (
    <div>
      <p className="text-base font-semibold leading-snug">{event.title}</p>
      <p className="text-sm mt-0.5" style={{ color: "var(--w-muted)" }}>{formatWhen(event)}</p>
      <p className="text-sm" style={{ color: "var(--w-muted)" }}>{formatWhere(event)}</p>
    </div>
  );
}

function OutcomeView({
  outcome, event, organizerName, headingRef, onBack, onRetry,
}: {
  outcome: Outcome;
  event: EmbedEvent;
  organizerName: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onRetry: () => void;
}) {
  const origin = window.location.origin;
  const eventUrl = `${origin}/events/${event.slug}`;
  const cal = {
    title: event.title,
    description: `Organised by ${organizerName}`,
    startAt: event.startAt,
    endAt: event.endAt,
    timezone: event.timezone,
    location: event.format === "VIRTUAL" ? "Online" : [event.venueName, event.address].filter(Boolean).join(", ") || undefined,
    url: eventUrl,
  };

  const copy: Record<Outcome["kind"], { tone: "success" | "info" | "neutral"; title: string; body: string }> = {
    CONFIRMED: { tone: "success", title: "You're registered", body: `Your ticket is on its way to ${"email" in outcome ? outcome.email : ""}. Show the QR code at the entrance.` },
    PENDING_APPROVAL: { tone: "info", title: "Request sent", body: `${organizerName} reviews every request. We'll email ${"email" in outcome ? outcome.email : "you"} as soon as you're approved.` },
    WAITLISTED: {
      tone: "info",
      title: "You're on the waitlist",
      body: `${outcome.kind === "WAITLISTED" && outcome.position ? `You're number ${outcome.position} in line. ` : ""}We'll email you right away if a spot opens.`,
    },
    ALREADY: { tone: "neutral", title: "You're already registered", body: `${"email" in outcome ? outcome.email : "This email"} is already on the list for this event. Check your inbox for your ticket, including the spam folder.` },
    CLOSED: { tone: "neutral", title: "Registration has closed", body: `${organizerName} is no longer taking registrations for this event.` },
    PAYMENT: { tone: "info", title: "Finish payment in the new window", body: "Complete checkout on udyaibase.com. Your ticket arrives by email once payment goes through. Didn't see a window? Allow pop-ups and try again." },
  };
  const c = copy[outcome.kind];
  const iconBg = c.tone === "success" ? "#dcfce7" : c.tone === "info" ? "#e0f2fe" : "var(--w-subtle)";
  const iconFg = c.tone === "success" ? "#15803d" : c.tone === "info" ? "#0369a1" : "var(--w-muted)";

  const linkBtn = "embed-focus embed-btn-secondary inline-flex items-center justify-center gap-2 min-h-[44px] px-3 text-sm font-medium";

  return (
    <div role="status" aria-live="polite">
      <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3" style={{ background: iconBg, color: iconFg }} aria-hidden>
        {c.tone === "success" ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        )}
      </div>
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{c.title}</h3>
      <p className="text-[0.9375rem] mt-1" style={{ color: "var(--w-muted)" }}>{c.body}</p>

      {(outcome.kind === "CONFIRMED" || outcome.kind === "PENDING_APPROVAL") && (
        <div className="mt-5">
          <p className="text-sm font-medium mb-2">Add to calendar</p>
          <div className="grid grid-cols-3 gap-2">
            <a className={linkBtn} href={generateGoogleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer">Google</a>
            <a className={linkBtn} href={generateOutlookCalendarUrl(cal)} target="_blank" rel="noopener noreferrer">Outlook</a>
            <a className={linkBtn} href={`${origin}/api/events/calendar?slug=${encodeURIComponent(event.slug)}`}>Apple</a>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        {(outcome.kind === "CONFIRMED" || outcome.kind === "WAITLISTED" || outcome.kind === "PENDING_APPROVAL") && (
          <a
            className="embed-focus embed-btn inline-flex items-center justify-center gap-2 min-h-[44px] px-4 text-sm font-semibold"
            href={`https://wa.me/?text=${encodeURIComponent(`I'm going to ${event.title}. Join me: ${eventUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share on WhatsApp
          </a>
        )}
        {outcome.kind === "ALREADY" && (
          <button type="button" onClick={onRetry} className="embed-focus embed-btn min-h-[44px] px-4 text-sm font-semibold">
            Use a different email
          </button>
        )}
        <button type="button" onClick={onBack} className="embed-focus embed-btn-secondary min-h-[44px] px-4 text-sm font-medium">
          See other events
        </button>
      </div>
    </div>
  );
}
