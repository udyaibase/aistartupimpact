"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { BUSINESS_TYPES } from "@/lib/events/payout-options";

interface Payouts { status: string; bankLast4: string | null; beneficiary: string | null; note: string | null; updatedAt: string | null; started: boolean; feePct: number }

const input = "w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand";
const label = "block text-sm font-semibold text-gray-900 dark:text-white mb-1.5";

const STATUS: Record<string, { text: string; tone: string; icon: React.ReactNode }> = {
  ACTIVATED: { text: "Payouts active. You can sell paid tickets.", tone: "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300", icon: <CheckCircle2 className="w-4 h-4" /> },
  UNDER_REVIEW: { text: "Razorpay is verifying your details. This usually takes 1–3 working days.", tone: "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300", icon: <Clock className="w-4 h-4" /> },
  NEEDS_CLARIFICATION: { text: "Razorpay needs a correction before payouts can start.", tone: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300", icon: <AlertTriangle className="w-4 h-4" /> },
  SUSPENDED: { text: "Payouts are suspended. Contact support.", tone: "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300", icon: <AlertTriangle className="w-4 h-4" /> },
};

/** Host payout setup for paid tickets (Razorpay Route). Bank and KYC details go to Razorpay only. */
export default function PayoutsPanel() {
  const [p, setP] = useState<Payouts | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ legalName: "", businessType: "individual", contactName: "", phone: "", pan: "", businessPan: "", gstin: "", street: "", city: "", state: "", postalCode: "", accountNumber: "", ifsc: "", beneficiaryName: "", acceptTerms: false });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const load = (refresh = false) => fetch(`/api/organizer/payouts${refresh ? "?refresh=1" : ""}`).then((r) => r.json()).then((d) => d.success ? setP(d.payouts) : setError(d.error || "Couldn’t load payouts.")).catch(() => setError("You seem to be offline."));
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/organizer/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setP(d.payouts); setEditing(false); setF((x) => ({ ...x, accountNumber: "", pan: "" })); }
      else setError(d.error || "Couldn’t set up payouts.");
    } catch { setError("You seem to be offline."); }
    setBusy(false);
  }

  if (!p) return <div className="p-6">{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />}</div>;
  const st = STATUS[p.status];

  return (
    <div className="p-4 sm:p-6 space-y-4 font-jakarta">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Sell paid tickets</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Ticket money is paid out to your bank account through Razorpay. Udyaibase keeps {p.feePct}% per ticket, which covers payment processing. Your share is released 2 days after the event ends, so attendees can be refunded if it’s cancelled.
        </p>
      </div>

      {st && (
        <div className={`flex items-start gap-2 rounded-[12px] px-3 py-2.5 text-sm ${st.tone}`}>
          <span className="mt-0.5">{st.icon}</span>
          <div className="flex-1">
            <p>{st.text}</p>
            {p.note && <p className="mt-0.5 text-[13px] opacity-90">{p.note}</p>}
            {p.bankLast4 && <p className="mt-0.5 text-[13px] opacity-90">Bank account ending {p.bankLast4}{p.beneficiary ? ` · ${p.beneficiary}` : ""}</p>}
          </div>
          {p.status !== "ACTIVATED" && (
            <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-1 min-h-[36px] px-2 text-[13px] font-semibold hover:underline"><RefreshCw className="w-3.5 h-3.5" /> Check status</button>
          )}
        </div>
      )}
      {!st && p.note && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{p.note}</p>}

      {(!p.started || editing || p.status === "NEEDS_CLARIFICATION") ? (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><label htmlFor="po-legal" className={label}>Legal name (as on PAN)</label><input id="po-legal" value={f.legalName} onChange={(e) => set("legalName", e.target.value)} className={input} /></div>
          <div><label htmlFor="po-type" className={label}>Business type</label>
            <select id="po-type" value={f.businessType} onChange={(e) => set("businessType", e.target.value)} className={input}>{BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div><label htmlFor="po-contact" className={label}>Contact person</label><input id="po-contact" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} className={input} /></div>
          <div><label htmlFor="po-phone" className={label}>Mobile number</label><input id="po-phone" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} placeholder="98xxxxxxxx" /></div>
          <div><label htmlFor="po-pan" className={label}>Personal PAN (of the contact)</label><input id="po-pan" value={f.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} maxLength={10} className={`${input} uppercase`} autoComplete="off" /></div>
          {f.businessType !== "individual" && f.businessType !== "not_yet_registered" && (
            <>
              <div><label htmlFor="po-bpan" className={label}>Business PAN</label><input id="po-bpan" value={f.businessPan} onChange={(e) => set("businessPan", e.target.value.toUpperCase())} maxLength={10} className={`${input} uppercase`} autoComplete="off" /></div>
              <div><label htmlFor="po-gst" className={label}>GSTIN <span className="font-normal text-gray-500">(optional)</span></label><input id="po-gst" value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} className={`${input} uppercase`} /></div>
            </>
          )}
          <div className="sm:col-span-2"><label htmlFor="po-street" className={label}>Address</label><input id="po-street" value={f.street} onChange={(e) => set("street", e.target.value)} className={input} /></div>
          <div><label htmlFor="po-city" className={label}>City</label><input id="po-city" value={f.city} onChange={(e) => set("city", e.target.value)} className={input} /></div>
          <div><label htmlFor="po-state" className={label}>State</label><input id="po-state" value={f.state} onChange={(e) => set("state", e.target.value)} className={input} /></div>
          <div><label htmlFor="po-pin" className={label}>PIN code</label><input id="po-pin" inputMode="numeric" value={f.postalCode} onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, ""))} maxLength={6} className={input} /></div>
          <div className="sm:col-span-2 pt-2 border-t border-gray-100 dark:border-gray-800"><p className="text-sm font-semibold text-gray-900 dark:text-white">Bank account for payouts</p></div>
          <div><label htmlFor="po-holder" className={label}>Account holder name</label><input id="po-holder" value={f.beneficiaryName} onChange={(e) => set("beneficiaryName", e.target.value)} className={input} /></div>
          <div><label htmlFor="po-acc" className={label}>Account number</label><input id="po-acc" inputMode="numeric" value={f.accountNumber} onChange={(e) => set("accountNumber", e.target.value.replace(/\D/g, ""))} maxLength={18} className={input} autoComplete="off" /></div>
          <div><label htmlFor="po-ifsc" className={label}>IFSC</label><input id="po-ifsc" value={f.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} maxLength={11} className={`${input} uppercase`} /></div>
          <label className="sm:col-span-2 flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={f.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#A50F15]" />
            <span>I agree to Razorpay’s <a href="https://razorpay.com/terms/" target="_blank" rel="noopener noreferrer" className="underline">terms</a> for receiving payouts, and confirm these details are correct.</span>
          </label>
          {error && <p role="alert" className="sm:col-span-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Submit to Razorpay
            </button>
            <span className="text-xs text-gray-500">Sent securely to Razorpay for verification. Udyaibase stores only the last 4 digits of your account.</span>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="min-h-[40px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">Update bank details</button>
      )}
    </div>
  );
}
