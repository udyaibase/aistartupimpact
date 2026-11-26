"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  BarChart3,
  QrCode,
  Download,
  Search,
  Check,
  X,
  ExternalLink,
  Trash2,
  Mail,
} from "lucide-react";
import { publishEventAction, deleteEventAction } from "../actions";
import { checkInAttendeeAction } from "./check-in-actions";

interface Props {
  event: any;
  registrations: any[];
  timeline: { date: string; count: number }[];
  stats: { checkedIn: number; confirmed: number; waitlisted: number; total: number };
}

export default function EventDashboard({ event, registrations, timeline, stats }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "attendees" | "checkin">("overview");
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [checkInInput, setCheckInInput] = useState("");
  const [checkInResult, setCheckInResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const SITE_URL = typeof window !== "undefined" ? window.location.origin : "";

  // Filtered registrations
  const filteredRegs = registrations.filter((r: any) => {
    const matchSearch = !searchQuery ||
      r.guestName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.guestEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.guestCompany?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handlePublish = async () => {
    setSaving(true);
    const result = await publishEventAction(event.id);
    setMessage(result.success ? "Published!" : result.error || "Failed");
    setSaving(false);
    if (result.success) router.refresh();
  };

  const handleDelete = async () => {
    setSaving(true);
    const result = await deleteEventAction(event.id);
    if (result.success) router.push("/events");
    else { setMessage(result.error || "Failed"); setSaving(false); }
  };

  const handleCheckIn = async () => {
    if (!checkInInput.trim()) return;
    setCheckInResult(null);
    const result = await checkInAttendeeAction(event.id, checkInInput.trim());
    setCheckInResult(result);
    if (result.success) setCheckInInput("");
  };

  const exportCSV = () => {
    const headers = ["Name", "Email", "Phone", "Company", "Role", "Tier", "Status", "Registered At", "Checked In At"];
    const rows = registrations.map((r: any) => [
      r.guestName || "",
      r.guestEmail || "",
      r.guestPhone || "",
      r.guestCompany || "",
      r.guestRole || "",
      r.tierName || "General",
      r.status,
      r.registeredAt,
      r.checkedInAt || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r: string[]) => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.slug}-attendees.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/events" className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <div>
            <h1 className="portal-title">{event.title}</h1>
            <p className="portal-subtitle">
              /{event.slug} · {event.category.replace(/_/g, " ")} ·{" "}
              <span className={event.status === "PUBLISHED" ? "text-green-600" : "text-gray-500"}>
                {event.status}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {message && <span className="text-xs text-green-600 font-jakarta">{message}</span>}
          <a
            href={`/events/${event.slug}`}
            target="_blank"
            rel="noopener"
            className="p-2 text-gray-400 hover:text-brand transition-colors"
            title="View public page"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          {event.status === "DRAFT" && (
            <button onClick={handlePublish} disabled={saving} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-full">
              Publish
            </button>
          )}
          <button onClick={() => setShowDelete(true)} className="p-2 text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {[
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "attendees", label: `Attendees (${stats.total})`, icon: Users },
          { id: "checkin", label: "Check-In", icon: QrCode },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-sm font-jakarta font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === tab.id
                ? "border-brand text-brand"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Registrations" value={stats.total} color="blue" />
            <StatCard label="Confirmed" value={stats.confirmed} color="green" />
            <StatCard label="Checked In" value={stats.checkedIn} color="purple" />
            <StatCard label="Waitlisted" value={stats.waitlisted} color="yellow" />
          </div>

          {/* Registration Timeline */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-sora font-semibold text-gray-700 dark:text-gray-200 mb-4">
              Registration Timeline
            </h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400 font-jakarta">No registrations yet</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {timeline.map((d, i) => {
                  const maxCount = Math.max(...timeline.map((t) => t.count));
                  const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.count}`}>
                      <span className="text-[9px] text-gray-400 font-mono">{d.count}</span>
                      <div
                        className="w-full bg-brand/20 rounded-t"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      {i % 5 === 0 && (
                        <span className="text-[8px] text-gray-400 font-mono truncate w-full text-center">
                          {d.date.slice(5)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Event Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
              <h3 className="text-sm font-sora font-semibold text-gray-700 dark:text-gray-200">Details</h3>
              <InfoRow label="Format" value={event.format.replace(/_/g, " ")} />
              <InfoRow label="Start" value={new Date(event.startAt).toLocaleString("en-IN")} />
              <InfoRow label="End" value={new Date(event.endAt).toLocaleString("en-IN")} />
              <InfoRow label="Venue" value={event.venueName || "—"} />
              <InfoRow label="Capacity" value={event.capacity ? String(event.capacity) : "Unlimited"} />
              <InfoRow label="Visibility" value={event.visibility} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
              <h3 className="text-sm font-sora font-semibold text-gray-700 dark:text-gray-200">
                Speakers ({event.speakers.length})
              </h3>
              {event.speakers.length === 0 ? (
                <p className="text-sm text-gray-400 font-jakarta">No speakers</p>
              ) : (
                event.speakers.slice(0, 5).map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center text-brand text-xs font-bold">
                      {s.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-200 font-jakarta">{s.name}</p>
                      <p className="text-[10px] text-gray-400">{[s.title, s.company].filter(Boolean).join(", ")}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Attendees Tab ─── */}
      {activeTab === "attendees" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, company..."
                  className="input-field pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-field w-auto"
              >
                <option value="">All Status</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CHECKED_IN">Checked In</option>
                <option value="WAITLISTED">Waitlisted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {filteredRegs.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400 font-jakarta">No attendees found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Attendee</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Company</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Tier</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {filteredRegs.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 font-jakarta">{r.guestName}</p>
                          <p className="text-[11px] text-gray-400">{r.guestEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-jakarta">
                          {r.guestCompany || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-jakarta">
                          {r.tierName || "General"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 text-[11px] text-gray-400 font-jakarta">
                          {new Date(r.registeredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-400 font-jakarta">
              Showing {filteredRegs.length} of {registrations.length} registrations
            </div>
          </div>
        </div>
      )}

      {/* ─── Check-In Tab ─── */}
      {activeTab === "checkin" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 max-w-lg">
            <h3 className="text-lg font-sora font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <QrCode className="w-5 h-5 text-brand" />
              Check-In Attendees
            </h3>
            <p className="text-sm text-gray-500 font-jakarta">
              Enter the attendee&apos;s QR token, email, or name to check them in.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={checkInInput}
                onChange={(e) => { setCheckInInput(e.target.value); setCheckInResult(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleCheckIn()}
                placeholder="QR token, email, or name..."
                className="input-field flex-1"
              />
              <button
                onClick={handleCheckIn}
                className="px-4 py-2 bg-brand hover:bg-brand-600 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                Check In
              </button>
            </div>

            {checkInResult && (
              <div className={`flex items-center gap-2 p-3 rounded-xl ${
                checkInResult.success
                  ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              }`}>
                {checkInResult.success ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                <span className="text-sm font-jakarta">{checkInResult.message}</span>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
              <p className="text-3xl font-sora font-extrabold text-green-600">{stats.checkedIn}</p>
              <p className="text-xs text-green-600/70 font-jakarta mt-1">Checked In</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
              <p className="text-3xl font-sora font-extrabold text-blue-600">{stats.total - stats.checkedIn}</p>
              <p className="text-xs text-blue-600/70 font-jakarta mt-1">Not Yet</p>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-sora font-bold text-gray-900 dark:text-white">Delete Event</h3>
            <p className="text-sm text-gray-500 font-jakarta">
              This will soft-delete the event. It won&apos;t appear in listings but data is preserved.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleDelete} disabled={saving} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600",
    green: "bg-green-50 dark:bg-green-900/20 text-green-600",
    purple: "bg-purple-50 dark:bg-purple-900/20 text-purple-600",
    yellow: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600",
  };

  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <p className="text-2xl font-sora font-extrabold">{value}</p>
      <p className="text-[10px] uppercase font-bold tracking-wider opacity-70 font-jakarta mt-1">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm font-jakarta">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700 dark:text-gray-300">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    CHECKED_IN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    WAITLISTED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    PENDING_PAYMENT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${styles[status] || styles.CONFIRMED}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
