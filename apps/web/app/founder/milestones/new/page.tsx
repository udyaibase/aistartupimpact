"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trophy, Send } from "lucide-react";
import { MilestoneIcon } from '@/components/milestones/MilestoneIcon';

const MILESTONE_TYPES = [
  { value: "FUNDING", label: "Funding", desc: "Raised capital" },
  { value: "LAUNCH", label: "Launch", desc: "Product or feature" },
  { value: "PARTNERSHIP", label: "Partnership", desc: "Strategic partner" },
  { value: "ACQUISITION", label: "Acquisition", desc: "Acquired a company" },
  { value: "AWARD", label: "Award", desc: "Recognition" },
  { value: "HIRING", label: "Hiring", desc: "Key hires or team growth" },
  { value: "REVENUE", label: "Revenue", desc: "Revenue milestone" },
  { value: "USER_MILESTONE", label: "Users", desc: "User or customer goal" },
];

export default function NewMilestonePage() {
  const router = useRouter();
  const [startups, setStartups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  const [startupId, setStartupId] = useState("");
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    fetch("/api/founder/milestones")
      .then(r => r.json())
      .then(d => {
        const s = d.startups || [];
        setStartups(s);
        if (s.length > 0) setStartupId(s[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showMsg = (text: string, t: "success" | "error") => {
    setMsg(text);
    setMsgType(t);
    setTimeout(() => setMsg(""), 4000);
  };

  const handleSubmit = async () => {
    if (!type) return showMsg("Select a milestone type", "error");
    if (!title.trim() || title.length < 3) return showMsg("Title must be at least 3 characters", "error");
    if (!startupId) return showMsg("Select a startup", "error");
    if (!date) return showMsg("Date is required", "error");

    setSubmitting(true);
    try {
      const res = await fetch("/api/founder/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId, type, title, description, amount: amount || null, currency, date }),
      });
      const d = await res.json();
      if (d.success) {
        if (d.duplicateWarning) showMsg(d.duplicateWarning, "error");
        router.push("/founder/content");
      } else showMsg(d.error || "Failed", "error");
    } catch { showMsg("Something went wrong", "error"); }
    setSubmitting(false);
  };

  const showAmount = ["FUNDING", "REVENUE", "ACQUISITION"].includes(type);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (startups.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white">List your startup first</p>
        <p className="text-sm font-jakarta text-gray-600 dark:text-gray-400 mt-1">Milestones are recorded against a startup, so list yours first. It only takes a few minutes.</p>
        <button onClick={() => router.push("/founder/startups/new")} className="mt-4 px-4 py-2 bg-brand text-white text-sm font-jakarta font-bold rounded-lg">List your startup</button>
      </div>
    );
  }

  return (
    <div>
      <div>
        <button onClick={() => router.push("/founder/content")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-jakarta mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Content
        </button>

        <div className="mb-6">
          <h1 className="portal-title">New Milestone</h1>
          <p className="portal-subtitle">Record a key achievement for your startup</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-6 space-y-5">
          {msg && (
            <p className={`text-xs font-jakarta px-3 py-2 rounded-lg ${msgType === "success" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>{msg}</p>
          )}

          {startups.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Startup</label>
              <select value={startupId} onChange={e => setStartupId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20">
                {startups.filter((s: any) => s.role !== "VIEWER").map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2 font-jakarta">Type *</label>
            <div className="grid grid-cols-4 gap-2">
              {MILESTONE_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setType(t.value)} className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all ${type === t.value ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                  <MilestoneIcon type={t.value} className="w-5 h-5" />
                  <span className="text-xs font-jakarta font-medium text-gray-700 dark:text-gray-300">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g., Raised $2M Seed Round" className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="Brief details about this milestone..." className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 resize-y" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20" />
            </div>
            {showAmount && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Amount</label>
                <div className="flex gap-2">
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className="px-2.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta text-gray-700 dark:text-gray-300 focus:outline-none">
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button onClick={() => router.push("/founder/content")} className="px-4 py-2.5 text-sm font-jakarta font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || !type || !title.trim()} className="px-4 py-2.5 bg-brand hover:bg-brand-600 text-white text-sm font-jakarta font-bold rounded-lg disabled:opacity-40 flex items-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Add Milestone
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
