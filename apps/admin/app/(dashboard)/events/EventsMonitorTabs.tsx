"use client";

import { useState } from "react";
import { CalendarDays, Users, Mail, Search, Download } from "lucide-react";

interface Props {
  data: {
    events: any[];
    organizers: any[];
    registrations: any[];
    stats: { events: number; organizers: number; registrations: number };
  };
}

type Tab = "events" | "organizers" | "attendees";

export default function EventsMonitorTabs({ data }: Props) {
  const [tab, setTab] = useState<Tab>("events");
  const [search, setSearch] = useState("");
  const [filterOccupation, setFilterOccupation] = useState("");
  const [filterCity, setFilterCity] = useState("");

  const filteredEvents = data.events.filter(e =>
    !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.organizer.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOrganizers = data.organizers.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAttendees = data.registrations.filter(r =>
    !search || r.guestName?.toLowerCase().includes(search.toLowerCase()) || r.guestEmail?.toLowerCase().includes(search.toLowerCase()) || r.eventTitle?.toLowerCase().includes(search.toLowerCase())
  );

  // Additional filters for attendees
  const finalAttendees = filteredAttendees.filter(r => {
    if (filterOccupation && r.guestOccupation !== filterOccupation) return false;
    if (filterCity && r.city !== filterCity) return false;
    return true;
  });

  // Unique values for filter dropdowns
  const uniqueOccupations = [...new Set(data.registrations.map(r => r.guestOccupation).filter(Boolean))].sort();
  const uniqueCities = [...new Set(data.registrations.map(r => r.city).filter(Boolean))].sort();

  const TABS: { id: Tab; label: string; count: number; icon: any }[] = [
    { id: "events", label: "Events", count: data.stats.events, icon: CalendarDays },
    { id: "organizers", label: "Organizers", count: data.stats.organizers, icon: Users },
    { id: "attendees", label: "Attendees", count: data.stats.registrations, icon: Mail },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="portal-title">Events Monitor</h1>
        <a href="/api/events/export" download className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`text-left p-4 rounded-xl border transition-all ${tab === t.id ? "border-brand bg-brand/5" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300"}`}>
            <p className={`text-2xl font-bold ${tab === t.id ? "text-brand" : "text-gray-900 dark:text-white"}`}>{t.count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
          </button>
        ))}
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-0">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-48 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-brand/30" />
        </div>
      </div>

      {/* Events Tab */}
      {tab === "events" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead><tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Event</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Organizer</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Date</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase">Regs</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredEvents.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3"><p className="text-sm font-medium text-gray-800 dark:text-gray-200">{e.title}</p><p className="text-[10px] text-gray-400">{e.category.replace(/_/g," ")} · {e.format.replace(/_/g," ")}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-gray-600 dark:text-gray-300">{e.organizer.name}</p><p className="text-[10px] text-gray-400">{e.organizer.email}</p></td>
                  <td className="px-4 py-3"><Badge status={e.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(e.startAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-white">{e.registrationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredEvents.length === 0 && <p className="text-center py-8 text-sm text-gray-400">No events found</p>}
        </div>
      )}

      {/* Organizers Tab */}
      {tab === "organizers" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead><tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Name</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Email</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Company</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Events</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Joined</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredOrganizers.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200">{o.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{o.email}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{o.company || "—"}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-white">{o.eventCount}</td>
                  <td className="px-4 py-3"><Badge status={o.status} /></td>
                  <td className="px-4 py-3 text-[10px] text-gray-400">{new Date(o.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrganizers.length === 0 && <p className="text-center py-8 text-sm text-gray-400">No organizers found</p>}
        </div>
      )}

      {/* Attendees Tab */}
      {tab === "attendees" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select value={filterOccupation} onChange={e => setFilterOccupation(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-brand/30">
              <option value="">All Occupations</option>
              {uniqueOccupations.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-brand/30">
              <option value="">All Cities</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-xs text-gray-400 self-center ml-2">{finalAttendees.length} results</span>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead><tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Email</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">City</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Occupation</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Event</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">WA</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase">Date</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {finalAttendees.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200">{r.guestName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.guestEmail}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.city || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.guestOccupation || "—"}</td>
                    <td className="px-4 py-3 text-xs text-brand font-medium">{r.eventTitle}</td>
                    <td className="px-4 py-3">{r.whatsappConsent ? <span className="text-green-600 text-xs">✓</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-[10px] text-gray-400">{new Date(r.registeredAt).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {finalAttendees.length === 0 && <p className="text-center py-8 text-sm text-gray-400">No attendees found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const s: Record<string, string> = {
    PUBLISHED: "bg-green-100 text-green-700", DRAFT: "bg-gray-100 text-gray-600",
    CANCELLED: "bg-red-100 text-red-600", COMPLETED: "bg-blue-100 text-blue-600",
    ACTIVE: "bg-green-100 text-green-700", SUSPENDED: "bg-red-100 text-red-600",
    PENDING_VERIFICATION: "bg-yellow-100 text-yellow-700",
    CONFIRMED: "bg-green-100 text-green-700", CHECKED_IN: "bg-blue-100 text-blue-700",
    WAITLISTED: "bg-yellow-100 text-yellow-700",
  };
  return <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${s[status] || "bg-gray-100 text-gray-600"}`}>{status.replace(/_/g," ")}</span>;
}
