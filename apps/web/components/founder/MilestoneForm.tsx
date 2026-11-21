"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Send, Save } from "lucide-react";
import { MilestoneIcon } from "@/components/milestones/MilestoneIcon";
import { milestoneAmount } from "@/lib/milestones/amount";

/**
 * Adding or changing a milestone: a key moment for a startup (funding, a launch, a partnership, an award).
 * `milestoneId` set means editing that one; it is loaded from the founder's own list.
 */

const MILESTONE_TYPES = [
  { value: "FUNDING", label: "Funding" },
  { value: "LAUNCH", label: "Launch" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "ACQUISITION", label: "Acquisition" },
  { value: "AWARD", label: "Award" },
  { value: "HIRING", label: "Hiring" },
  { value: "REVENUE", label: "Revenue" },
  { value: "USER_MILESTONE", label: "Users" },
];
const WITH_AMOUNT = ["FUNDING", "REVENUE", "ACQUISITION"];
const fieldBase = "px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand";
const field = `${fieldBase} w-full`;
const label = "block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 font-jakarta";

interface Startup { id: string; name: string; role: string }

export default function MilestoneForm({ milestoneId }: { milestoneId?: string }) {
  const router = useRouter();
  const editing = !!milestoneId;
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // The server found a similar milestone and is asking before saving a second one.
  const [similar, setSimilar] = useState("");

  const [startupId, setStartupId] = useState("");
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    fetch("/api/founder/milestones")
      .then((r) => r.json())
      .then((d) => {
        const list: Startup[] = d.startups || [];
        setStartups(list);
        if (!editing) { setStartupId(list.find((s) => s.role !== "VIEWER")?.id ?? ""); return; }
        const m = (d.milestones || []).find((x: { id: string }) => x.id === milestoneId);
        if (!m) { setMissing(true); return; }
        setStartupId(m.startupId);
        setType(m.type);
        setTitle(m.title);
        setDescription(m.description ?? "");
        setAmount(m.amount != null ? String(Number(m.amount)) : "");
        setCurrency(m.currency || "INR");
        setDate(String(m.date).slice(0, 10));
      })
      .catch(() => setError("Couldn’t load. Check your connection and reload."))
      .finally(() => setLoading(false));
  }, [editing, milestoneId]);

  // A message about the form is about how it was a moment ago: once something changes, take it down.
  useEffect(() => { setError(""); setSimilar(""); }, [type, title, description, amount, currency, date, startupId]);

  const showAmount = WITH_AMOUNT.includes(type);
  const today = new Date();
  const maxDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().split("T")[0];

  const save = async (confirmSimilar = false) => {
    setError("");
    const stop = (message: string, focusId?: string) => {
      setError(message);
      // After the message is drawn: show it, and put the cursor where the fix is needed.
      requestAnimationFrame(() => {
        document.getElementById("milestone-error")?.scrollIntoView({ block: "center", behavior: "smooth" });
        if (focusId) (document.querySelector<HTMLElement>(`#${focusId} button`) ?? document.getElementById(focusId))?.focus({ preventScroll: true });
      });
    };
    if (!type) return stop("Choose what kind of milestone this is.", "milestone-type");
    if (title.trim().length < 3) return stop("Give it a title of at least 3 characters.", "milestone-title");
    if (!startupId) return stop("Choose a startup.", "milestone-startup");
    if (!date) return stop("Add the date it happened.", "milestone-date");
    if (showAmount && amount && Number(amount) < 0) return stop("The amount can’t be negative.", "milestone-amount");

    setSubmitting(true);
    try {
      const body = { type, title: title.trim(), description: description.trim(), amount: showAmount && amount ? amount : null, currency, date };
      const res = editing
        ? await fetch(`/api/founder/milestones/${milestoneId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/founder/milestones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, startupId, confirmSimilar }) });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.code === "similar") {
        setSimilar(d.error || "You already have a similar milestone.");
        setSubmitting(false);
        // The question is at the top of the form; the button that was pressed is at the bottom.
        requestAnimationFrame(() => document.getElementById("milestone-similar")?.scrollIntoView({ block: "center", behavior: "smooth" }));
        return;
      }
      if (!res.ok || !d.success) throw new Error(d.error || "Couldn’t save the milestone. Please try again.");
      try { sessionStorage.setItem("founder-content-flash", editing ? "Milestone updated." : "Milestone added. It’s on your public profile now."); } catch {}
      router.push("/founder/content");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save the milestone.");
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading" /></div>;

  if (missing) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white">We can’t find that milestone</p>
        <p className="text-sm font-jakarta text-gray-600 dark:text-gray-400 mt-1">It may have been deleted.</p>
        <button type="button" onClick={() => router.push("/founder/content")} className="btn-brand mt-4">Back to Content</button>
      </div>
    );
  }

  if (startups.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white">List your startup first</p>
        <p className="text-sm font-jakarta text-gray-600 dark:text-gray-400 mt-1">Milestones are recorded against a startup, so list yours first. It only takes a few minutes.</p>
        <button onClick={() => router.push("/founder/startups/new")} className="btn-brand mt-4">List your startup</button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => router.push("/founder/content")} className="flex items-center gap-1.5 min-h-[40px] text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-jakarta mb-2">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back to Content
      </button>

      <div className="mb-6">
        <h1 className="portal-title">{editing ? "Edit milestone" : "New milestone"}</h1>
        <p className="portal-subtitle">{editing ? "Correct the details. The change shows on your startup’s public profile straight away." : "Record a key moment for your startup. It shows on your startup’s public profile straight away."}</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="bg-white dark:bg-gray-900 -mx-4 sm:mx-0 border-y sm:border border-gray-100 dark:border-gray-800 rounded-none sm:rounded-xl px-4 py-5 sm:p-6 space-y-5">
        {error && <p id="milestone-error" role="alert" className="text-sm font-jakarta px-3 py-2 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}

        {similar && (
          <div id="milestone-similar" role="alert" className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 font-jakarta">{similar}</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 font-jakarta mt-0.5">If this is the same event, go back and edit that one. If it’s a different event, add it anyway.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => router.push("/founder/content")} className="min-h-[40px] px-3 rounded-lg border border-amber-300 dark:border-amber-700 text-sm font-semibold text-amber-900 dark:text-amber-200">Go back</button>
              <button type="button" disabled={submitting} onClick={() => { setSimilar(""); void save(true); }} className="min-h-[40px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold">Add it anyway</button>
            </div>
          </div>
        )}

        {startups.length > 1 && !editing && (
          <div>
            <label htmlFor="milestone-startup" className={label}>Startup</label>
            <select id="milestone-startup" value={startupId} onChange={(e) => setStartupId(e.target.value)} className={field}>
              {startups.filter((s) => s.role !== "VIEWER").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <fieldset id="milestone-type">
          <legend className={label}>Type *</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MILESTONE_TYPES.map((t) => (
              <button key={t.value} type="button" aria-pressed={type === t.value} onClick={() => setType(t.value)}
                className={`relative flex flex-row sm:flex-col items-center justify-start sm:justify-center gap-2 sm:gap-1.5 min-h-[44px] sm:min-h-[64px] px-3 py-2 sm:p-3 rounded-lg border text-left sm:text-center transition-colors ${type === t.value ? "border-gray-900 dark:border-white ring-1 ring-gray-900 dark:ring-white bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"}`}>
                {type === t.value && <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5" aria-hidden />}
                {/* The word below names the button; the icon is decoration here. */}
                <span aria-hidden="true"><MilestoneIcon type={t.value} className="w-5 h-5" plain /></span>
                <span className="text-sm sm:text-xs font-jakarta font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="milestone-title" className={label}>Title *</label>
          <input id="milestone-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Raised a ₹2 crore seed round" className={field} />
        </div>

        <div>
          <label htmlFor="milestone-description" className={label}>Description</label>
          <textarea id="milestone-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="A sentence or two about it (optional)" className={`${field} resize-none`} />
          <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 text-right">{description.length}/500</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="milestone-date" className={label}>Date *</label>
            <input id="milestone-date" type="date" value={date} min="1990-01-01" max={maxDate} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          {showAmount && (
            <div>
              <label htmlFor="milestone-amount" className={label}>Amount</label>
              <div className="flex gap-2">
                <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${fieldBase} w-24 shrink-0`}>
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
                <input id="milestone-amount" type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 20000000" className={`${fieldBase} flex-1 min-w-0`} />
              </div>
              {/* Long numbers are easy to mistype: show how it will read on the public page. */}
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1" aria-live="polite">
                {milestoneAmount(amount, currency)
                  ? <>Shows as <span className="font-semibold text-gray-900 dark:text-white">{milestoneAmount(amount, currency)}</span></>
                  : "Optional. Type the full number: ₹2 crore is 20000000."}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button type="button" onClick={() => router.push("/founder/content")} className="min-h-[44px] px-4 text-sm font-jakarta font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-brand min-h-[44px] gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : editing ? <Save className="w-4 h-4" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
            {editing ? "Save changes" : "Add milestone"}
          </button>
        </div>
      </form>
    </div>
  );
}
