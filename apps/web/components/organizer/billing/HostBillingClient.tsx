"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles, Star } from "lucide-react";
import { payWithRazorpay } from "@/lib/billing/checkout-client";
import BillingDetailsForm from "@/components/billing/BillingDetailsForm";
import type { BillingProfile } from "@/lib/billing/details";
import { HOST_FOUNDING_DISCOUNT, HOST_FOUNDING_LIMIT, HOST_FOUNDING_LOCK_MONTHS, type HostBillingCycle, type HostPlan, type HostPlanKey } from "@/lib/events/plans";
import InvoicesTable, { type InvoiceRow } from "@/components/billing/InvoicesTable";

type Price = { amount: number; gst: number; total: number };
interface EventRow { id: string; title: string; startAt: string; boosted: boolean; featured: boolean; registered: number; limit: number; waitlisted: number }

const card = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]";
const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function HostBillingClient({ current, expiresAt, usage, cycle: currentCycle, pro, founding, plans, boost, events, payments, highlight, paymentsReady, billing, invoices }: {
  current: HostPlanKey;
  expiresAt: string | null;
  usage: { upcoming: number; team: number; promo: { used: number; limit: number; left: number } };
  cycle: HostBillingCycle;
  pro: { monthly: Price; yearly: Price; yearlyFounding: Price };
  founding: { eligible: boolean; member: boolean; placesLeft: number };
  plans: (HostPlan & { price: Price })[];
  boost: { pricePaise: number; registrationsPerEvent: number; features: string[]; price: Price };
  events: EventRow[];
  payments: InvoiceRow[];
  highlight: string | null;
  paymentsReady: boolean;
  billing: BillingProfile;
  invoices: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cycle, setCycle] = useState<HostBillingCycle>(current === "PRO" ? currentCycle : "MONTHLY");
  const plan = plans.find((p) => p.key === current)!;
  const yearly = cycle === "ANNUAL";
  const proPrice = yearly ? (founding.eligible ? pro.yearlyFounding : pro.yearly) : pro.monthly;
  const yearlySavePct = Math.round((1 - pro.yearly.amount / (pro.monthly.amount * 12)) * 100);
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 864e5)) : null;

  async function buy(kind: "PRO" | "BOOST", eventId?: string) {
    setBusy(eventId ?? kind);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/organizer/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, eventId, ...(kind === "PRO" ? { cycle } : {}) }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Couldn’t start the payment."); setBusy(null); return; }
      const out = await payWithRazorpay(d, "/api/organizer/billing/verify");
      if (out.ok) { setNotice(kind === "PRO" ? "Payment received. Pro is active." : "Payment received. Your event is boosted."); router.refresh(); }
      else if (!out.cancelled) setError(out.error);
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(null);
  }

  const stat = (label: string, value: React.ReactNode, sub?: string) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );

  return (
    <div className="font-jakarta space-y-5">
      <div>
        <h1 className="portal-title">Plans &amp; billing</h1>
        <p className="portal-subtitle">Free covers small meetups. Boost one event when you need reach, or go Pro if you host often. No auto-renewal.</p>
      </div>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`text-sm rounded-[10px] px-3 py-2 ${error ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300" : "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"}`}>{error || notice}</p>
      )}

      <section aria-label="Current plan" className={`${card} p-4 sm:p-5 grid gap-4 grid-cols-2 lg:grid-cols-4`}>
        {stat("Current plan", plan.name, expiresAt ? `${currentCycle === "ANNUAL" ? "Yearly · " : ""}Until ${fmt(expiresAt)} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left${founding.member ? " · founding price" : ""}` : "Free forever")}
        {stat("Upcoming events", <>{usage.upcoming} <span className="text-sm font-normal text-gray-500">{plan.maxUpcomingEvents >= 1000 ? "· unlimited" : `of ${plan.maxUpcomingEvents}`}</span></>)}
        {stat("Teammates", <>{usage.team} <span className="text-sm font-normal text-gray-500">of {plan.teamMembers}</span></>)}
        {stat("Promo emails", plan.promoEmailsPerPeriod ? <>{usage.promo.left} <span className="text-sm font-normal text-gray-500">left of {usage.promo.limit}</span></> : "—", plan.promoEmailsPerPeriod ? "this month" : "Boost an event to include it")}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Pro billing period" className="inline-flex rounded-[10px] border border-gray-200 dark:border-gray-800 p-1 bg-white dark:bg-gray-900">
          {(["MONTHLY", "ANNUAL"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)}
              className={`min-h-[36px] px-3 rounded-[8px] text-sm font-semibold ${cycle === c ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}>
              {c === "MONTHLY" ? "Monthly" : `Yearly · save ${yearlySavePct}%`}
            </button>
          ))}
        </div>
        {yearly && founding.eligible && (
          <p className="text-[13px] text-gray-700 dark:text-gray-300">
            <span className="font-semibold text-[#A50F15] dark:text-red-300">Founding host price: {Math.round(HOST_FOUNDING_DISCOUNT * 100)}% off yearly Pro</span>
            {" "}for {HOST_FOUNDING_LOCK_MONTHS} months{founding.member ? "" : ` · ${founding.placesLeft} of ${HOST_FOUNDING_LIMIT} places left`}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => {
          const isCurrent = p.key === current;
          return (
            <section key={p.key} aria-labelledby={`hp-${p.key}`} className={`${card} p-5 flex flex-col ${p.key === "PRO" ? "ring-2 ring-[#A50F15]/70 border-transparent" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 id={`hp-${p.key}`} className="text-base font-bold text-gray-900 dark:text-white">{p.name}</h2>
                {isCurrent && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">Current</span>}
                {!isCurrent && p.key === "PRO" && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#A50F15]/10 text-[#A50F15] dark:text-red-300">For regular hosts</span>}
              </div>
              {p.key === "PRO" ? (
                <>
                  <p className="mt-2">
                    {yearly && founding.eligible && <span className="mr-1.5 text-sm text-gray-400 line-through tabular-nums">{rupees(pro.yearly.amount)}</span>}
                    <span className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums">{rupees(proPrice.amount)}</span>
                    <span className="text-sm text-gray-500">{yearly ? " / year" : " / month"}</span>
                  </p>
                  <p className="text-xs text-gray-500">+ 18% GST · {rupees(proPrice.total)} total{yearly ? ` · ${rupees(Math.round(proPrice.amount / 12))}/mo` : ""}</p>
                </>
              ) : (
                <>
                  <p className="mt-2"><span className="text-2xl font-extrabold text-gray-900 dark:text-white">₹0</span></p>
                  <p className="text-xs text-gray-500">Free forever</p>
                </>
              )}
              <ul className="mt-4 space-y-2 flex-1">
                {p.features.map((f) => <li key={f} className="flex items-start gap-2 text-[13.5px] text-gray-700 dark:text-gray-300"><Check className="w-4 h-4 mt-0.5 text-green-600 shrink-0" aria-hidden /> {f}</li>)}
              </ul>
              {p.key === "PRO" && (
                <button type="button" onClick={() => buy("PRO")} disabled={!!busy || !paymentsReady}
                  className={`mt-5 w-full min-h-[44px] rounded-[10px] text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${isCurrent ? "border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" : "bg-gray-900 dark:bg-white text-white dark:text-gray-900"}`}>
                  {busy === "PRO" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {isCurrent ? (cycle === currentCycle ? (yearly ? "Add 1 year" : "Add 30 days") : `Switch to ${yearly ? "yearly" : "monthly"}`) : "Upgrade to Pro"}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <section aria-labelledby="boost-h" className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="boost-h" className="portal-section-title flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-[#A50F15]" aria-hidden /> Event Boost · {rupees(boost.price.amount)} per event</h2>
          <span className="text-xs text-gray-500">+ 18% GST · {rupees(boost.price.total)} total · one-time</span>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{boost.features.join(" · ")}.</p>
        <p className="mt-1 text-[13px] text-gray-500">A Boost raises the limit for that one event only; your other events keep your plan&apos;s limit.</p>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Publish an event to boost it.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {events.map((e) => {
              const full = e.registered >= e.limit;
              return (
                <li key={e.id} className={`py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${highlight === e.id ? "bg-amber-50/60 dark:bg-amber-900/10 -mx-2 px-2 rounded-[10px]" : ""}`}>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{e.title}</p>
                    <p className="text-[12.5px] text-gray-500">
                      {fmt(e.startAt)} · {e.registered.toLocaleString("en-IN")} of {e.limit.toLocaleString("en-IN")} registrations
                      {e.waitlisted > 0 && <span className="font-semibold text-amber-800 dark:text-amber-300"> · {e.waitlisted} waitlisted</span>}
                    </p>
                    {full && !e.boosted && current === "FREE" && <p className="text-[12.5px] text-amber-800 dark:text-amber-300">At the Free limit: new sign-ups go to the waitlist.</p>}
                  </div>
                  {e.featured && <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300"><Star className="w-3 h-3" aria-hidden /> Featured</span>}
                  {e.boosted ? (
                    <span className="text-[13px] font-semibold text-green-700 dark:text-green-400 inline-flex items-center gap-1"><Check className="w-4 h-4" aria-hidden /> Boosted</span>
                  ) : (
                    <button type="button" onClick={() => buy("BOOST", e.id)} disabled={!!busy || !paymentsReady}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                      {busy === e.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />} Boost
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!paymentsReady && <p className="text-sm text-gray-600 dark:text-gray-400">Online payments are being set up. To upgrade now, email <a className="font-semibold underline" href="mailto:billing@udyaibase.com">billing@udyaibase.com</a>.</p>}

      {payments.length > 0 && (
        <section aria-labelledby="hhist" className={card}>
          <h2 id="hhist" className="portal-section-title px-4 sm:px-5 pt-4 pb-2">Invoices</h2>
          <InvoicesTable rows={payments} invoicesOn={invoices} apiBase="/api/organizer/billing/invoice" invoiceEmail={billing.billingEmail} />
        </section>
      )}
      <section aria-labelledby="hbd-h" className={`${card} p-4 sm:p-5`}>
        <h2 id="hbd-h" className="portal-section-title">Billing details</h2>
        <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">Who your invoices are made out to and where they’re emailed.</p>
        <BillingDetailsForm initial={billing} lookupUrl="/api/organizer/billing/gstin" save={async (details) => {
          const res = await fetch("/api/organizer/billing/details", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) }).catch(() => null);
          if (!res) return { error: "You seem to be offline." };
          const d = await res.json().catch(() => ({}));
          return res.ok ? { warnings: d.warnings } : { error: d.error || "Couldn’t save.", field: d.field };
        }} />
      </section>
    </div>
  );
}
