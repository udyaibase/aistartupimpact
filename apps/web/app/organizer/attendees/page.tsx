"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Search, Download, Check, X, ArrowUpCircle, Loader2, ChevronDown, RotateCcw } from "lucide-react";

type Registration = {
  id: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestCompany: string | null;
  guestOccupation: string | null;
  status: string;
  registeredAt: string;
  checkedInAt: string | null;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  paymentStatus?: string | null;
  amountPaise?: number | null;
};

const STATUSES = ["CONFIRMED", "PENDING_APPROVAL", "CHECKED_IN", "WAITLISTED", "CANCELLED"] as const;

export default function AttendeesPage() {
  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [processing, setProcessing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRegistrations = useCallback(async () => {
    const res = await fetch("/api/organizer/registrations");
    const data = await res.json();
    if (data.success) setRegs(data.registrations);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

  const filtered = regs.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.guestName?.toLowerCase().includes(q) ||
        r.guestEmail?.toLowerCase().includes(q) ||
        r.guestCompany?.toLowerCase().includes(q) ||
        r.eventTitle?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  };

  const performAction = async (ids: string[], action: string) => {
    const res = await fetch("/api/organizer/registrations/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationIds: ids, action }),
    });
    return res.json();
  };

  const handleSingleAction = async (id: string, action: string) => {
    if (action === "refund") {
      const reg = regs.find((x) => x.id === id);
      if (!confirm(`Refund ₹${((reg?.amountPaise ?? 0) / 100).toLocaleString("en-IN")} to ${reg?.guestName || reg?.guestEmail}? Their ticket is cancelled and the money goes back to them.`)) return;
      setActionLoading(id);
      const res = await fetch(`/api/organizer/registrations/${id}/refund`, { method: "POST" }).then((r) => r.json()).catch(() => ({ success: false, error: "You seem to be offline." }));
      if (!res.success) alert(res.error || "Refund failed.");
      await fetchRegistrations();
      setActionLoading(null);
      return;
    }
    setActionLoading(id);
    await performAction([id], action);
    await fetchRegistrations();
    setActionLoading(null);
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selected.size === 0) return;
    setProcessing(true);
    await performAction(Array.from(selected), bulkAction);
    setSelected(new Set());
    setBulkAction("");
    setProcessing(false);
    await fetchRegistrations();
  };

  const pendingCount = regs.filter(r => r.status === "PENDING_APPROVAL").length;
  const waitlistCount = regs.filter(r => r.status === "WAITLISTED").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="portal-title">All Attendees</h1>
          <p className="portal-subtitle">
            {regs.length} total registrations
            {pendingCount > 0 && <span className="ml-2 text-amber-600 font-semibold">· {pendingCount} pending approval</span>}
            {waitlistCount > 0 && <span className="ml-2 text-yellow-600 font-semibold">· {waitlistCount} waitlisted</span>}
          </p>
        </div>
        <a
          data-tour="attendee-export"
          href="/api/organizer/attendees"
          download
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-bold font-jakarta rounded-lg"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            data-tour="attendee-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            inputMode="search"
            enterKeyHint="search"
            placeholder="Search name, email, company, event..."
            className="w-full min-h-[44px] pl-9 pr-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-base sm:text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="flex-1 sm:flex-none min-h-[44px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta"
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400 font-jakarta">{filtered.length} results</span>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-brand/5 border border-brand/10 rounded-lg">
          <span className="text-xs font-semibold text-brand font-jakarta">{selected.size} selected</span>
          <select
            value={bulkAction}
            onChange={e => setBulkAction(e.target.value)}
            aria-label="Bulk action"
            className="flex-1 sm:flex-none min-h-[40px] px-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-jakarta"
          >
            <option value="">Action...</option>
            <option value="approve">Approve (Pending → Confirmed)</option>
            <option value="reject">Reject (Pending → Cancelled)</option>
            <option value="promote">Promote (Waitlist → Confirmed)</option>
            <option value="cancel">Cancel Registration</option>
          </select>
          <button
            onClick={handleBulkAction}
            disabled={!bulkAction || processing}
            className="min-h-[40px] px-4 bg-brand text-white text-sm font-bold rounded-lg disabled:opacity-40 font-jakarta"
          >
            {processing ? "Processing..." : "Apply"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="min-h-[40px] px-2 text-sm text-gray-600 font-jakarta hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400 font-jakarta">No attendees found</p>
          </div>
        ) : (
          <>
          <ul data-tour="attendee-table" className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map(r => {
              const isSel = selected.has(r.id);
              return (
                <li key={r.id} className={`px-4 py-3.5 ${isSel ? "bg-brand/5" : ""}`}>
                  <div className="flex items-start gap-3">
                    <label className="-m-2 p-2 shrink-0 cursor-pointer" aria-label={`Select ${r.guestName || r.guestEmail}`}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r.id)} className="w-5 h-5 rounded text-brand focus:ring-brand" />
                    </label>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white font-jakarta truncate">{r.guestName || "Guest"}</p>
                        <Badge status={r.status} />
                      </div>
                      <p className="text-[13px] text-gray-500 font-jakarta truncate">{r.guestEmail}</p>
                      <p className="text-[13px] text-brand font-medium font-jakarta truncate mt-0.5">{r.eventTitle}</p>
                      <div className="mt-2.5">
                        <RowActions reg={r} labeled loading={actionLoading === r.id} onAction={(action) => handleSingleAction(r.id, action)} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={selectAll}
                      className="w-3.5 h-3.5 rounded text-brand focus:ring-brand"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase hidden lg:table-cell">Company</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Event</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-3.5 h-3.5 rounded text-brand focus:ring-brand"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 font-jakarta">{r.guestName || "—"}</div>
                      <div className="text-xs text-gray-400 font-jakarta md:hidden">{r.guestEmail}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 hidden md:table-cell">{r.guestEmail || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 hidden lg:table-cell">{r.guestCompany || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-brand font-medium font-jakarta truncate max-w-[120px]">{r.eventTitle}</td>
                    <td className="px-3 py-2.5">
                      <Badge status={r.status} />
                      {r.paymentStatus === "PAID" && r.amountPaise ? <span className="ml-1.5 text-[11px] font-semibold text-green-700 dark:text-green-400">Paid ₹{(r.amountPaise / 100).toLocaleString("en-IN")}</span> : null}
                      {r.paymentStatus === "REFUNDED" && <span className="ml-1.5 text-[11px] font-semibold text-gray-500">Refunded</span>}
                      {r.paymentStatus === "PENDING" && r.status === "PENDING_PAYMENT" && <span className="ml-1.5 text-[11px] text-gray-500">Paying…</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <RowActions
                        reg={r}
                        loading={actionLoading === r.id}
                        onAction={(action) => handleSingleAction(r.id, action)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

function RowActions({ reg, loading, onAction, labeled }: { reg: Registration; loading: boolean; onAction: (action: string) => void; labeled?: boolean }) {
  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;

  const base = labeled
    ? "inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-lg text-sm font-semibold font-jakarta border transition-colors"
    : "w-9 h-9 inline-flex items-center justify-center rounded-lg transition-colors";
  const tone = {
    ok: labeled ? "border-green-200 text-green-700 active:bg-green-50 dark:border-green-900/50 dark:text-green-400" : "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20",
    bad: labeled ? "border-red-200 text-red-600 active:bg-red-50 dark:border-red-900/50 dark:text-red-400" : "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20",
    muted: labeled ? "border-gray-200 text-gray-600 active:bg-gray-50 dark:border-gray-700 dark:text-gray-300" : "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20",
  };

  if (reg.paymentStatus === "PAID" && reg.status !== "CHECKED_IN") {
    return (
      <button onClick={() => onAction("refund")} title="Refund and cancel" aria-label="Refund and cancel" className={`${base} ${tone.bad}`}>
        <RotateCcw className="w-4 h-4" />{labeled && "Refund"}
      </button>
    );
  }

  if (reg.status === "PENDING_APPROVAL") {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => onAction("approve")} title="Approve" aria-label="Approve" className={`${base} ${tone.ok}`}>
          <Check className="w-4 h-4" />{labeled && "Approve"}
        </button>
        <button onClick={() => onAction("reject")} title="Decline" aria-label="Decline" className={`${base} ${tone.bad}`}>
          <X className="w-4 h-4" />{labeled && "Decline"}
        </button>
      </div>
    );
  }

  if (reg.status === "WAITLISTED") {
    return (
      <button onClick={() => onAction("promote")} title="Move to confirmed" aria-label="Move to confirmed" className={`${base} ${tone.ok}`}>
        <ArrowUpCircle className="w-4 h-4" />{labeled && "Move to confirmed"}
      </button>
    );
  }

  if (reg.status === "CONFIRMED") {
    return (
      <button onClick={() => onAction("cancel")} title="Cancel registration" aria-label="Cancel registration" className={`${base} ${tone.muted}`}>
        <X className="w-4 h-4" />{labeled && "Cancel registration"}
      </button>
    );
  }

  return labeled ? null : <span className="text-xs text-gray-300">—</span>;
}

function statusLabel(s: string): string {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Badge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    PENDING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    CHECKED_IN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    WAITLISTED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    CANCELLED: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    PENDING_PAYMENT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${styles[status] || styles.CONFIRMED}`}>
      {statusLabel(status)}
    </span>
  );
}
