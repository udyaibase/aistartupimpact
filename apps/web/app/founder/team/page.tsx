"use client";

import { useState, useEffect, useRef } from "react";
import { Users, Plus, Loader2, Mail, Trash2, X, ChevronDown, ShieldCheck, Briefcase } from "lucide-react";

const ROLES = [
  { value: "ADMIN", label: "Admin", desc: "Full access, manage team" },
  { value: "EDITOR", label: "Editor", desc: "Edit startup profile & content" },
  { value: "VIEWER", label: "Viewer", desc: "View-only access" },
];

interface OTPAction {
  type: "role_change" | "revoke";
  memberId: string;
  newRole?: string;
  memberName?: string;
  /** Revoke only: startups where this person is also on the hiring team. */
  hiringStartups?: string[];
}

interface PersonAccess {
  email: string;
  name: string | null;
  content: { memberId: string; role: string; status: string } | null;
  hiring: { memberId: string; startup: string; roleLabel: string; status: string }[];
}

function OTPModal({
  action,
  onVerified,
  onClose,
}: {
  action: OTPAction;
  onVerified: (otpToken: string, otpCode: string, alsoHiring: boolean) => void;
  onClose: () => void;
}) {
  const [alsoHiring, setAlsoHiring] = useState(true);
  const [otpToken, setOtpToken] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const requestOTP = async () => {
      setSending(true);
      setError("");
      const res = await fetch("/api/founder/team/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.type }),
      });
      const d = await res.json();
      if (d.success) {
        setOtpToken(d.otpToken);
        setSent(true);
      } else {
        setError(d.error || "Failed to send code");
      }
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    requestOTP();
  }, [action.type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setError("Enter the 6-digit code"); return; }
    setVerifying(true);
    onVerified(otpToken, code, !!action.hiringStartups?.length && alsoHiring);
  };

  const actionLabel = action.type === "role_change"
    ? `Change ${action.memberName || "member"}'s role to ${action.newRole}`
    : `Revoke ${action.memberName || "member"}'s access`;

  return (
    <div className="fixed inset-0 z-modal bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand/10 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-brand"/>
            </div>
            <h2 className="font-sora font-bold text-sm text-navy dark:text-white">Security Verification</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4">
          To <strong>{actionLabel}</strong>, enter the 6-digit code sent to your email.
        </p>

        {sending ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-brand"/>
            <span className="text-sm text-gray-500 font-jakarta">Sending verification code...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {sent && (
              <p className="text-xs text-green-600 dark:text-green-400 font-jakarta bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                Code sent to your email. Check your inbox.
              </p>
            )}
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(""); }}
              placeholder="000000"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center text-2xl font-mono font-bold tracking-[0.5em] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
              autoFocus
            />
            {action.type === "revoke" && !!action.hiringStartups?.length && (
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 font-jakarta cursor-pointer">
                <input type="checkbox" checked={alsoHiring} onChange={(e) => setAlsoHiring(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#A50F15]" />
                <span>Also remove their hiring access ({action.hiringStartups.join(", ")}), so they can&apos;t see candidates either.</span>
              </label>
            )}
            {error && <p className="text-xs text-red-500 font-jakarta">{error}</p>}
            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="w-full py-2.5 bg-brand hover:bg-brand-600 text-white font-bold text-sm font-jakarta rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {verifying && <Loader2 className="w-4 h-4 animate-spin"/>} Verify & Confirm
            </button>
            <p className="text-[10px] text-gray-400 text-center font-jakarta">Code expires in 10 minutes</p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function FounderTeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invRole, setInvRole] = useState("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [otpAction, setOtpAction] = useState<OTPAction | null>(null);
  const [people, setPeople] = useState<PersonAccess[]>([]);
  const [removeHiring, setRemoveHiring] = useState<PersonAccess | null>(null);
  const [busyHiring, setBusyHiring] = useState(false);

  const loadPeople = () =>
    fetch("/api/founder/people").then((r) => r.json()).then((d) => { if (d.success) setPeople(d.people); }).catch(() => {});
  useEffect(() => { loadPeople(); }, []);

  const confirmRemoveHiring = async () => {
    if (!removeHiring) return;
    setBusyHiring(true);
    const res = await fetch("/api/founder/people/hiring", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: removeHiring.email }) });
    const d = await res.json().catch(() => ({}));
    setBusyHiring(false);
    setMsg(d.success ? `Hiring access removed for ${removeHiring.email}` : d.error || "Failed to remove");
    if (d.success) setPeople(d.people);
    setRemoveHiring(null);
    setTimeout(() => setMsg(""), 4000);
  };

  useEffect(() => {
    fetch("/api/founder/team")
      .then(r => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then(d => {
        if (d.success) setMembers(d.members || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleInvite = async () => {
    if (!invEmail) return;
    setInviting(true); setMsg("");
    const res = await fetch("/api/founder/team", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invEmail, role: invRole, name: invName || undefined }),
    });
    const d = await res.json();
    if (d.success) {
      setMsg("Invite sent!");
      setInvEmail(""); setInvName(""); setInvRole("VIEWER");
      setShowInvite(false);
      setMembers(prev => [d.member, ...prev]);
    } else {
      setMsg(d.error || "Failed");
    }
    setInviting(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleRoleChangeRequest = (member: any, newRole: string) => {
    setEditingRole(null);
    setOtpAction({ type: "role_change", memberId: member.id, newRole, memberName: member.name || member.email });
  };

  const handleRevokeRequest = (member: any) => {
    const hiring = people.find((p) => p.email === String(member.email).toLowerCase())?.hiring ?? [];
    setOtpAction({ type: "revoke", memberId: member.id, memberName: member.name || member.email, hiringStartups: hiring.map((h) => h.startup) });
  };

  const handleOTPVerified = async (otpToken: string, otpCode: string, alsoHiring: boolean) => {
    if (!otpAction) return;

    if (otpAction.type === "role_change") {
      const res = await fetch(`/api/founder/team/${otpAction.memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: otpAction.newRole, otpToken, otpCode }),
      });
      const d = await res.json();
      if (d.success) {
        setMembers(prev => prev.map(m => m.id === otpAction.memberId ? { ...m, role: otpAction.newRole } : m));
        setMsg("Role updated successfully");
      } else {
        setMsg(d.error || "Failed to change role");
      }
    } else {
      const res = await fetch(`/api/founder/team/${otpAction.memberId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpToken, otpCode, alsoHiring }),
      });
      const d = await res.json();
      if (d.success) {
        setMembers(prev => prev.map(m => m.id === otpAction.memberId ? { ...m, status: "REVOKED" } : m));
        setMsg(d.hiringRemoved ? "Access revoked, including hiring" : "Access revoked");
        loadPeople();
      } else {
        setMsg(d.error || "Failed to revoke");
      }
    }

    setOtpAction(null);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleResendInvite = async (member: any) => {
    setMsg("");
    const res = await fetch("/api/founder/team", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: member.email, role: member.role, name: member.name }),
    });
    const d = await res.json();
    if (d.success) {
      setMsg("Invite resent!");
      setMembers(prev => prev.map(m => m.id === member.id ? d.member : m));
    } else {
      setMsg(d.error || "Failed to resend");
    }
    setTimeout(() => setMsg(""), 3000);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand"/></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora font-bold text-lg text-navy dark:text-white flex items-center gap-2"><Users className="w-5 h-5 text-brand"/> Team</h1>
          <p className="text-xs text-gray-500 font-jakarta">Invite members to help manage your startup</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand hover:bg-brand-600 text-white text-xs font-bold font-jakarta rounded-lg">
          <Plus className="w-3.5 h-3.5"/> Invite Member
        </button>
      </div>

      {msg && <p className={`text-xs font-jakarta px-3 py-2 rounded-lg ${msg.includes("sent") || msg.includes("Invite") || msg.includes("updated") || msg.includes("revoked") || msg.includes("removed for") ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>{msg}</p>}

      {showInvite && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy dark:text-white font-sora">Invite Team Member</h2>
            <button onClick={() => setShowInvite(false)}><X className="w-4 h-4 text-gray-400"/></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Email *</label>
              <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="teammate@company.com" className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Name</label>
              <input type="text" value={invName} onChange={e => setInvName(e.target.value)} placeholder="Team member name" maxLength={100} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20"/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">Role</label>
            <div className="grid grid-cols-3 gap-2">{ROLES.map(r => (
              <button key={r.value} type="button" onClick={() => setInvRole(r.value)} className={`p-2.5 rounded-lg border text-left transition-all ${invRole === r.value ? "border-brand bg-brand/5" : "border-gray-200 dark:border-gray-700"}`}>
                <p className={`text-xs font-semibold font-jakarta ${invRole === r.value ? "text-brand" : "text-gray-700 dark:text-gray-200"}`}>{r.label}</p>
                <p className="text-xs text-gray-400 font-jakarta">{r.desc}</p>
              </button>
            ))}</div>
          </div>
          <button onClick={handleInvite} disabled={inviting || !invEmail} className="w-full py-2.5 bg-brand hover:bg-brand-600 text-white font-bold text-sm font-jakarta rounded-lg disabled:opacity-40 flex items-center justify-center gap-2">
            {inviting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Mail className="w-4 h-4"/>} Send Invite
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {members.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
            <p className="text-sm text-gray-400 font-jakarta">No team members yet</p>
            <p className="text-xs text-gray-300 font-jakarta mt-1">Invite your first team member to get started</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 grid grid-cols-12 gap-2">
              <span className="col-span-5 text-xs font-bold text-gray-400 uppercase font-jakarta">Member</span>
              <span className="col-span-2 text-xs font-bold text-gray-400 uppercase font-jakarta">Role</span>
              <span className="col-span-2 text-xs font-bold text-gray-400 uppercase font-jakarta">Status</span>
              <span className="col-span-3 text-xs font-bold text-gray-400 uppercase font-jakarta text-right">Actions</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {members.map(m => (
                <div key={m.id} className="px-4 py-3 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex-shrink-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-brand">{(m.name || m.email)?.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      {m.name && <p className="text-sm font-medium text-gray-700 dark:text-gray-200 font-jakarta truncate">{m.name}</p>}
                      <p className="text-xs text-gray-400 font-jakarta truncate">{m.email}</p>
                    </div>
                  </div>
                  <div className="col-span-2 relative">
                    {m.role === "OWNER" ? (
                      <span className="text-xs font-bold text-brand font-jakarta">Owner</span>
                    ) : m.status !== "REVOKED" ? (
                      <button onClick={() => setEditingRole(editingRole === m.id ? null : m.id)} className="text-xs font-medium text-gray-600 dark:text-gray-300 font-jakarta inline-flex items-center gap-1 hover:text-brand">
                        {m.role} <ChevronDown className="w-3 h-3"/>
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 font-jakarta">{m.role}</span>
                    )}
                    {editingRole === m.id && (
                      <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-dropdown py-1 min-w-[120px]">
                        {ROLES.map(r => (
                          <button key={r.value} onClick={() => handleRoleChangeRequest(m, r.value)} className={`w-full text-left px-3 py-1.5 text-xs font-jakarta hover:bg-gray-50 dark:hover:bg-gray-700 ${m.role === r.value ? "text-brand font-bold" : "text-gray-600 dark:text-gray-300"}`}>
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${m.status === "ACTIVE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : m.status === "PENDING" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>{m.status}</span>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-1">
                    {m.status === "PENDING" && (
                      <button onClick={() => handleResendInvite(m)} className="text-xs text-brand hover:text-brand-600 font-jakarta font-medium px-2 py-1 rounded hover:bg-brand/5">
                        Resend
                      </button>
                    )}
                    {m.status !== "REVOKED" && m.role !== "OWNER" && (
                      <button onClick={() => handleRevokeRequest(m)} className="p-1.5 text-gray-400 hover:text-red-500" title="Revoke access">
                        <Trash2 className="w-3.5 h-3.5"/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {people.length > 0 && (
        <section aria-labelledby="people-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 id="people-title" className="text-sm font-bold text-navy dark:text-white font-sora">Everyone with access</h2>
            <p className="text-xs text-gray-500 font-jakarta mt-0.5">Your founder team (profile and content) and the hiring team of each startup (jobs and candidates). Hiring roles are managed in the employer portal.</p>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {people.map((p) => (
              <li key={p.email} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-jakarta truncate">{p.name || p.email}</p>
                  {p.name && <p className="text-xs text-gray-400 font-jakarta truncate">{p.email}</p>}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p.content && (
                      <span className="text-xs font-jakarta px-2 py-0.5 rounded-full bg-brand/10 text-brand">Founder portal · {p.content.role.charAt(0) + p.content.role.slice(1).toLowerCase()}{p.content.status === "PENDING" ? " (invited)" : ""}</span>
                    )}
                    {p.hiring.map((h) => (
                      <span key={h.memberId} className="inline-flex items-center gap-1 text-xs font-jakarta px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        <Briefcase className="w-3 h-3" aria-hidden /> {h.startup} · {h.roleLabel}{h.status === "PENDING" ? " (invited)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
                {p.hiring.length > 0 && (
                  <button onClick={() => setRemoveHiring(p)} className="self-start sm:self-center text-xs font-semibold text-red-600 hover:underline font-jakarta min-h-[36px] px-2">Remove from hiring</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {removeHiring && (
        <div className="fixed inset-0 z-modal bg-black/50 flex items-center justify-center p-4" onClick={() => setRemoveHiring(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="rh-title" className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <p id="rh-title" className="text-sm font-bold text-navy dark:text-white font-sora">Remove {removeHiring.name || removeHiring.email} from hiring?</p>
            <p className="text-xs text-gray-500 font-jakarta mt-1">They lose access to jobs and candidates for {removeHiring.hiring.map((h) => h.startup).join(", ")} right away. Their notes stay on candidates.{removeHiring.content ? " Their founder-portal access doesn’t change." : ""}</p>
            <div className="flex justify-end gap-2 mt-5">
              <button autoFocus onClick={() => setRemoveHiring(null)} className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 font-jakarta rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Keep</button>
              <button onClick={confirmRemoveHiring} disabled={busyHiring} className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 font-jakarta rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5">
                {busyHiring && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0"/>
        <p className="text-xs text-blue-700 dark:text-blue-300 font-jakarta">
          Role changes and access revocations require email verification for security.
        </p>
      </div>

      {otpAction && (
        <OTPModal
          action={otpAction}
          onVerified={handleOTPVerified}
          onClose={() => setOtpAction(null)}
        />
      )}
    </div>
  );
}
