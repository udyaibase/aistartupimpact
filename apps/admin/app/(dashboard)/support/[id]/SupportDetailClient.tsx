"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send, User, Shield, Eye, Clock, MessageSquare } from "lucide-react";

interface Message {
  id: string;
  senderType: string;
  senderName: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  context?: Record<string, string> | null;
  planAtOpen?: string | null;
  category: string;
  priority: string;
  status: string;
  portal: string;
  submitterType: string;
  submitterId: string;
  submitterName: string;
  submitterEmail: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

const STATUSES = ["OPEN", "IN_PROGRESS", "AWAITING_USER", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUS_LABELS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In Progress", AWAITING_USER: "Awaiting User", RESOLVED: "Resolved", CLOSED: "Closed" };
const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
const CATEGORY_LABELS: Record<string, string> = { ACCOUNT: "Account", BILLING: "Billing", BUG_REPORT: "Bug Report", FEATURE_REQUEST: "Feature Request", LISTING: "Listing", EVENT: "Event", JOB_BOARD: "Job Board", OTHER: "Other" };
const PORTAL_LABELS: Record<string, string> = { FOUNDER: "Founder", ORGANIZER: "Organizer", EMPLOYER: "Employer", PUBLIC: "Public" };

interface Props {
  ticketId: string;
  adminId: string;
  adminName: string;
}

export default function SupportDetailClient({ ticketId, adminId, adminName }: Props) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTicket = async () => {
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}`);
      const data = await res.json();
      if (data.success) setTicket(data.ticket);
      else setError("Ticket not found");
    } catch { setError("Failed to load ticket"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTicket(); }, [ticketId]);

  useEffect(() => {
    if (!ticket) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/support-tickets/${ticketId}`);
        const data = await res.json();
        if (data.success && data.ticket.messages.length !== ticket.messages.length) setTicket(data.ticket);
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [ticket?.messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages.length]);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true); setError("");
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply, isInternal }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || "Failed to send"); return; }
      setReply("");
      fetchTicket();
    } catch { setError("Failed to send reply"); }
    finally { setSending(false); }
  };

  const updateTicket = async (field: string, value: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.success) fetchTicket();
    } catch {}
    finally { setUpdating(false); }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " at " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  if (!ticket) return <div className="text-center py-16"><p className="text-sm text-gray-500">{error || "Ticket not found"}</p></div>;

  return (
    <div className="space-y-4">
      <Link href="/support" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to tickets
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-gray-400">{ticket.ticketNumber}</span>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${ticket.portal === "FOUNDER" ? "bg-purple-100 text-purple-700" : ticket.portal === "ORGANIZER" ? "bg-teal-100 text-teal-700" : "bg-indigo-100 text-indigo-700"}`}>{PORTAL_LABELS[ticket.portal]}</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{ticket.subject}</h1>
            <p className="text-xs text-gray-400 mt-1">{ticket.submitterName} ({ticket.submitterEmail}) · {formatDate(ticket.createdAt)}</p>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><User className="w-3.5 h-3.5 text-gray-600" /></div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{ticket.submitterName}</span>
                  <span className="text-xs text-gray-400">{formatDate(ticket.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap pl-9">{ticket.description}</p>
                {ticket.context && (
                  <dl className="mt-3 ml-9 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-500">
                    {Object.entries(ticket.context).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="contents"><dt className="font-semibold capitalize">{k === 'jobId' ? 'Job' : k}</dt><dd className="break-all">{String(v)}</dd></div>
                    ))}
                    {ticket.planAtOpen && <div className="contents"><dt className="font-semibold">Plan</dt><dd>{ticket.planAtOpen}</dd></div>}
                  </dl>
                )}
              </div>

              {ticket.messages.map((msg) => (
                <div key={msg.id} className={`p-4 ${msg.isInternal ? "bg-amber-50/50 dark:bg-amber-900/5 border-l-2 border-amber-400" : msg.senderType === "ADMIN" ? "bg-blue-50/50 dark:bg-blue-900/5" : ""}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${msg.senderType === "ADMIN" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-gray-800"}`}>
                      {msg.senderType === "ADMIN" ? <Shield className="w-3.5 h-3.5 text-blue-600" /> : <User className="w-3.5 h-3.5 text-gray-600" />}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{msg.senderName}</span>
                    {msg.senderType === "ADMIN" && <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-600 rounded">Admin</span>}
                    {msg.isInternal && <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded flex items-center gap-0.5"><Eye className="w-3 h-3" />Internal</span>}
                    <span className="text-xs text-gray-400">{formatDate(msg.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap pl-9">{msg.body}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                  <Eye className="w-3 h-3" /> Internal note (not visible to user)
                </label>
              </div>
              <div className="flex gap-2">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={isInternal ? "Write an internal note..." : "Reply to user..."} rows={3} className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }} />
                <button onClick={handleSend} disabled={sending || !reply.trim()} className={`self-end px-4 py-2 text-sm font-semibold rounded-lg transition-opacity disabled:opacity-50 ${isInternal ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-brand text-white hover:opacity-90"}`}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket Details</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={ticket.status} onChange={(e) => updateTicket("status", e.target.value)} disabled={updating} className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <select value={ticket.priority} onChange={(e) => updateTicket("priority", e.target.value)} disabled={updating} className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2 text-xs text-gray-500">
              <div className="flex justify-between"><span>Category</span><span className="text-gray-900 dark:text-white font-medium">{CATEGORY_LABELS[ticket.category]}</span></div>
              <div className="flex justify-between"><span>Portal</span><span className="text-gray-900 dark:text-white font-medium">{PORTAL_LABELS[ticket.portal]}</span></div>
              <div className="flex justify-between"><span>Messages</span><span className="text-gray-900 dark:text-white font-medium">{ticket.messages.length}</span></div>
              <div className="flex justify-between"><span>Created</span><span className="text-gray-900 dark:text-white font-medium">{new Date(ticket.createdAt).toLocaleDateString("en-IN")}</span></div>
              <div className="flex justify-between"><span>Updated</span><span className="text-gray-900 dark:text-white font-medium">{new Date(ticket.updatedAt).toLocaleDateString("en-IN")}</span></div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Submitter</h3>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{ticket.submitterName}</p>
            <p className="text-xs text-gray-500">{ticket.submitterEmail}</p>
            <p className="text-xs text-gray-400 mt-1">{ticket.submitterType}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
