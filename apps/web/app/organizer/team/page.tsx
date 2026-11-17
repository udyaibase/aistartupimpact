"use client";

import { useState, useEffect } from "react";
import TransferOwnership from "@/components/organizer/TransferOwnership";
import { Users, Plus, Loader2, Mail, Trash2, X, Pencil } from "lucide-react";

const ROLES = [
  { value: "ADMIN", label: "Admin", desc: "Full access, including team and billing" },
  { value: "MANAGER", label: "Manager", desc: "Edit events, manage registrations" },
  { value: "STAFF", label: "Staff", desc: "Check-in, view attendees (no export)" },
  { value: "CHECK_IN", label: "Check-in only", desc: "QR scanner only" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

type Viewer = { role: string; canManage: boolean; assignableRoles: string[] };
type Member = {
  id: string; email: string; role: string; status: string; canEdit?: boolean;
  assignments?: { eventId: string; event?: { id: string; title: string } }[];
};

function RolePicker({ value, onChange, allowed }: { value: string; onChange: (r: string) => void; allowed: string[] }) {
  return (
    <div role="radiogroup" aria-label="Role" className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
      {ROLES.filter((r) => allowed.includes(r.value)).map((r) => (
        <button key={r.value} type="button" role="radio" aria-checked={value === r.value} onClick={() => onChange(r.value)}
          className={`min-h-[56px] p-3 rounded-lg border text-left transition-all ${value === r.value ? "border-brand bg-brand/5" : "border-gray-200 dark:border-gray-700"}`}>
          <p className={`text-xs font-semibold font-jakarta ${value === r.value ? "text-brand" : "text-gray-700 dark:text-gray-200"}`}>{r.label}</p>
          <p className="text-xs text-gray-400 font-jakarta">{r.desc}</p>
        </button>
      ))}
    </div>
  );
}

function EventPicker({ events, value, onChange }: { events: { id: string; title: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (events.length === 0) return <p className="text-xs text-gray-400 font-jakarta">No events yet. This person will get access to all events.</p>;
  return (
    <div className="max-h-56 overflow-y-auto overscroll-contain space-y-0.5 bg-gray-50 dark:bg-gray-800 rounded-lg p-1.5">
      {events.map((e) => (
        <label key={e.id} className="flex items-center gap-3 cursor-pointer min-h-[44px] px-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <input type="checkbox" checked={value.includes(e.id)} onChange={(ev) => onChange(ev.target.checked ? [...value, e.id] : value.filter((id) => id !== e.id))} className="w-4 h-4 rounded text-brand focus:ring-brand" />
          <span className="text-sm text-gray-700 dark:text-gray-200 font-jakarta">{e.title}</span>
        </label>
      ))}
    </div>
  );
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [viewer, setViewer] = useState<Viewer>({ role: "STAFF", canManage: false, assignableRoles: [] });
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("STAFF");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [invEventIds, setInvEventIds] = useState<string[]>([]);
  // Editing one member at a time
  const [editId, setEditId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("STAFF");
  const [editEventIds, setEditEventIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/organizer/team").then((r) => r.json()).catch(() => ({})),
      fetch("/api/organizer/events").then((r) => r.json()).catch(() => ({})),
    ]).then(([teamRes, evRes]) => {
      if (teamRes.success) {
        setMembers(teamRes.members || []);
        if (teamRes.viewer) setViewer(teamRes.viewer);
      }
      if (evRes.success) setEvents(evRes.events || []);
      setLoading(false);
    });
  }, []);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  const handleInvite = async () => {
    if (!invEmail) return;
    setInviting(true); setMsg(null);
    const res = await fetch("/api/organizer/team", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invEmail, role: invRole, eventIds: invEventIds }),
    });
    const d = await res.json().catch(() => ({}));
    if (d.success) {
      flash(true, "Invite sent.");
      setInvEmail(""); setInvEventIds([]); setShowInvite(false);
      setMembers((prev) => [d.member, ...prev.filter((m) => m.id !== d.member.id)]);
    } else flash(false, d.error || "Could not send the invite.");
    setInviting(false);
  };

  const startEdit = (m: Member) => {
    setEditId(m.id);
    setEditRole(m.role);
    setEditEventIds((m.assignments || []).map((a) => a.eventId));
  };

  const handleSave = async (m: Member) => {
    setSaving(true); setMsg(null);
    const eventIds = editRole === "ADMIN" ? [] : editEventIds;
    const res = await fetch(`/api/organizer/team/${m.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: editRole, eventIds }),
    });
    const d = await res.json().catch(() => ({}));
    if (d.success) {
      setMembers((prev) => prev.map((x) => x.id === m.id
        ? { ...x, role: editRole, assignments: eventIds.map((id) => ({ eventId: id, event: events.find((e) => e.id === id) })) }
        : x));
      setEditId(null);
      flash(true, editRole !== m.role ? `${m.email} is now ${roleLabel(editRole)}.` : "Changes saved.");
    } else flash(false, d.error || "Could not save the changes.");
    setSaving(false);
  };

  const handleRevoke = async (m: Member) => {
    if (!confirm(`Remove ${m.email} from the team? They lose access straight away.`)) return;
    const res = await fetch(`/api/organizer/team/${m.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (d.success) {
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "REVOKED", canEdit: false } : x)));
      if (editId === m.id) setEditId(null);
    } else flash(false, d.error || "Could not remove this person.");
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="portal-title flex items-center gap-2"><Users className="w-5 h-5 text-brand" /> Team</h1>
          <p className="portal-subtitle">
            {viewer.canManage ? "Invite people, change their roles and choose which events they work on" : "People who help run this workspace"}
          </p>
        </div>
        {viewer.canManage && (
          <button data-tour="team-invite" onClick={() => { setShowInvite(true); setInvRole(viewer.assignableRoles.includes("STAFF") ? "STAFF" : viewer.assignableRoles[0]); }}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 bg-brand hover:bg-brand-600 active:bg-brand-700 text-white text-sm font-bold font-jakarta rounded-lg">
            <Plus className="w-4 h-4" /> Invite member
          </button>
        )}
      </div>

      {msg && <p role="status" className={`text-xs font-jakarta px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}

      {showInvite && viewer.canManage && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between"><h2 className="portal-section-title">Invite team member</h2><button onClick={() => setShowInvite(false)} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4 text-gray-500" /></button></div>
          <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Email *</label><input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="teammate@company.com" autoComplete="email" inputMode="email" className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20" /></div>
          <div><p className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Role</p><RolePicker value={invRole} onChange={setInvRole} allowed={viewer.assignableRoles} /></div>
          <div><p className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Assign to events <span className="normal-case">(leave empty for all)</span></p><EventPicker events={events} value={invEventIds} onChange={setInvEventIds} /></div>
          <button onClick={handleInvite} disabled={inviting || !invEmail} className="w-full min-h-[48px] bg-brand hover:bg-brand-600 active:bg-brand-700 text-white font-bold text-sm font-jakarta rounded-lg disabled:opacity-40 flex items-center justify-center gap-2">
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send invite
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {members.length === 0 ? (
          <div className="text-center py-12"><Users className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400 font-jakarta">No team members yet</p></div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {members.map((m) => {
              const editable = viewer.canManage && m.canEdit && m.status !== "REVOKED";
              const editing = editId === m.id;
              return (
                <div key={m.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-brand/10 flex items-center justify-center"><span className="text-xs font-bold text-brand">{m.email?.charAt(0).toUpperCase()}</span></div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 font-jakarta truncate">{m.email}</p>
                        <p className="text-xs text-gray-400 font-jakarta">
                          {roleLabel(m.role)} · {m.assignments && m.assignments.length > 0 ? `${m.assignments.length} event${m.assignments.length > 1 ? "s" : ""}` : "All events"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${m.status === "ACTIVE" ? "bg-green-100 text-green-700" : m.status === "PENDING" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"}`}>{m.status}</span>
                      {editable && !editing && (
                        <button onClick={() => startEdit(m)} aria-label={`Change role for ${m.email}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-brand hover:bg-brand/5"><Pencil className="w-4 h-4" /></button>
                      )}
                      {editable && (
                        <button onClick={() => handleRevoke(m)} aria-label={`Remove ${m.email}`} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>

                  {editing && (
                    <div className="mt-3 space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                      <div><p className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Role</p><RolePicker value={editRole} onChange={setEditRole} allowed={viewer.assignableRoles} /></div>
                      {editRole === "ADMIN" ? (
                        <p className="text-xs text-gray-400 font-jakarta">Admins can work on every event.</p>
                      ) : (
                        <div><p className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Events <span className="normal-case">(leave empty for all)</span></p><EventPicker events={events} value={editEventIds} onChange={setEditEventIds} /></div>
                      )}
                      <div className="flex flex-col-reverse min-[420px]:flex-row gap-2 min-[420px]:justify-end">
                        <button onClick={() => setEditId(null)} className="min-h-[44px] px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-600 dark:text-gray-300">Cancel</button>
                        <button onClick={() => handleSave(m)} disabled={saving} className="min-h-[44px] px-5 bg-brand hover:bg-brand-600 active:bg-brand-700 text-white text-sm font-bold font-jakarta rounded-lg disabled:opacity-40 inline-flex items-center justify-center gap-2">
                          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewer.role === "OWNER" && (
        <TransferOwnership admins={members.filter((m) => m.role === "ADMIN" && m.status === "ACTIVE").map((m) => ({ id: m.id, email: m.email }))} />
      )}
    </div>
  );
}
