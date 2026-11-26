"use client";

import { notify } from '@/components/Toast';
import { useState, useTransition, useEffect, useMemo } from "react";
import DataTable, { type Column, type TableFilter } from "@/components/ui/DataTable";
import { UserPlus, Shield, Mail, X, Save, Trash2, Edit3, Key, Clock, ShieldCheck, ShieldOff } from "lucide-react";
import { useSession } from "next-auth/react";
import { inviteUser, updateUserMode, toggleUserStatus, resetUserTwoFactorAction, deleteUser, grantDeleteAccessAction, revokeDeleteAccessAction, getDeletePermissionsAction } from "./actions";
import { ask } from '@/components/Ask';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  articles: number;
  lastActive: string;
  twoFactorEnabled?: boolean;
  locked?: boolean;
}

const roles = [
  "SUPER_ADMIN",
  "EDITOR_IN_CHIEF",
  "SENIOR_WRITER",
  "WRITER",
  "AD_MANAGER",
  "CONTRIBUTOR",
];

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  EDITOR_IN_CHIEF: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  SENIOR_WRITER: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  WRITER: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  AD_MANAGER: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  CONTRIBUTOR: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

const emptyUser: User = {
  id: "",
  name: "",
  email: "",
  role: "WRITER",
  status: "ACTIVE",
  articles: 0,
  lastActive: "Just now",
};

export default function UsersPageClient({ initialUsers }: { initialUsers: User[] }) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [isPending, startTransition] = useTransition();
  const [grantModal, setGrantModal] = useState<User | null>(null);
  const [grantHours, setGrantHours] = useState('24');
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [activePermissions, setActivePermissions] = useState<any[]>([]);

  // Load active delete permissions
  useEffect(() => {
    if (isSuperAdmin) {
      getDeletePermissionsAction().then(setActivePermissions).catch(() => {});
    }
  }, [isSuperAdmin]);

  const openCreate = () => {
    setEditing({ ...emptyUser });
    setModalOpen(true);
  };
  const openEdit = (u: User) => {
    setEditing({ ...u });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    startTransition(async () => {
      let res;
      if (editing.id) {
        // Edit existing
        res = await updateUserMode(editing.id, {
          name: editing.name,
          email: editing.email,
          role: editing.role,
        });
      } else {
        // Invite new
        res = await inviteUser({
          name: editing.name,
          email: editing.email,
          role: editing.role,
        });
      }

      if (res?.error) {
        notify(res.error);
      } else {
        setModalOpen(false);
        setEditing(null);
      }
    });
  };

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const res = await deleteUser(id);
      if (res.error) notify(res.error);
      setDeleteConfirm(null);
    });
  };

  const handleResetTwoFactor = async (u: User) => {
    if (!(await ask({ title: 'Reset two-factor authentication', message: `Reset it for ${u.name || u.email}? Use this only if they lost their authenticator. They can sign in with Google alone until they set it up again.`, confirmLabel: 'Reset', danger: true }))) return;
    startTransition(async () => {
      const res = await resetUserTwoFactorAction(u.id);
      if (res.error) notify(res.error);
    });
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    startTransition(async () => {
      const res = await toggleUserStatus(id, currentStatus);
      if (res.error) notify(res.error);
    });
  };

  const myId = session?.user?.id;
  const roleLabel = (r: string) => r.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  const columns = useMemo<Column<User>[]>(() => [
    {
      key: "member", header: "Member", sortValue: (u) => u.name, searchValue: (u) => `${u.name} ${u.email}`,
      cell: (u) => (
        <div className="flex items-center gap-3 min-w-0">
          <span aria-hidden className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 text-sm font-semibold shrink-0">{u.name ? u.name.charAt(0) : "?"}</span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate">{u.name}{u.id === myId && <span className="ml-1.5 text-xs font-normal text-gray-600 dark:text-gray-400">(you)</span>}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role", header: "Role", sortValue: (u) => u.role,
      cell: (u) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${roleColors[u.role] || roleColors["CONTRIBUTOR"]}`}><Shield className="w-3 h-3" aria-hidden /> {roleLabel(u.role)}</span>,
    },
    {
      key: "twoFactor", header: "Two-factor", sortValue: (u) => (u.locked ? 2 : u.twoFactorEnabled ? 0 : 1),
      cell: (u) => (
        <span className="whitespace-nowrap">
          {u.twoFactorEnabled
            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400"><ShieldCheck className="w-3.5 h-3.5" aria-hidden /> On</span>
            : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400"><ShieldOff className="w-3.5 h-3.5" aria-hidden /> Off</span>}
          {u.locked && <span className="block text-xs font-semibold text-red-700 dark:text-red-400">Locked (wrong codes)</span>}
        </span>
      ),
    },
    { key: "articles", header: "Articles", align: "right", sortValue: (u) => u.articles, cell: (u) => u.articles },
    {
      key: "status", header: "Status", sortValue: (u) => u.status,
      cell: (u) => {
        const pill = `text-xs font-semibold px-2.5 py-0.5 rounded-full ${u.status === "ACTIVE" ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"}`;
        const label = u.status === "ACTIVE" ? "Active" : "Deactivated";
        return isSuperAdmin && u.id !== myId
          ? <button onClick={() => handleToggleStatus(u.id, u.status)} className={`${pill} hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600`} title={u.status === "ACTIVE" ? "Deactivate this account" : "Reactivate this account"} aria-label={`${label}. ${u.status === "ACTIVE" ? "Deactivate" : "Reactivate"} ${u.name || u.email}`}>{label}</button>
          : <span className={pill}>{label}</span>;
      },
    },
    ...(isSuperAdmin ? [{
      key: "actions", header: "Actions", align: "right" as const,
      cell: (u: User) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => openEdit(u)} aria-label={`Edit ${u.name || u.email}`} title="Edit" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Edit3 className="w-4 h-4" aria-hidden /></button>
          {(u.twoFactorEnabled || u.locked) && u.id !== myId && (
            <button onClick={() => handleResetTwoFactor(u)} title="Reset two-factor (lost authenticator)" aria-label={`Reset two-factor for ${u.name || u.email}`} className="p-1.5 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"><ShieldOff className="w-4 h-4" aria-hidden /></button>
          )}
          <button onClick={() => setDeleteConfirm(u.id)} disabled={u.id === myId} aria-label={`Delete ${u.name || u.email}`} title={u.id === myId ? "You can't delete your own account" : "Delete"}
            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], [isSuperAdmin, myId]);

  const filters = useMemo<TableFilter<User>[]>(() => [
    { key: "role", label: "Role", options: roles.map((r) => ({ value: r, label: roleLabel(r) })), matches: (u, v) => u.role === v },
    { key: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "OFF", label: "Deactivated" }], matches: (u, v) => (u.status === "ACTIVE") === (v === "ACTIVE") },
    { key: "twoFactor", label: "Two-factor", options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }, { value: "locked", label: "Locked" }], matches: (u, v) => (v === "locked" ? !!u.locked : !!u.twoFactorEnabled === (v === "on")) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">
            Team
          </h1>
          <p className="portal-subtitle">
            Staff who can sign in to this admin, their roles and two-factor status.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={openCreate}
            className="btn-brand text-sm flex items-center gap-2"
            disabled={isPending}
          >
            <UserPlus className="w-4 h-4" aria-hidden /> Invite member
          </button>
        )}
      </div>

      <div className={isPending ? "opacity-60 pointer-events-none" : undefined}>
        <DataTable
          tableId="team"
          noun="team members"
          rows={initialUsers}
          rowKey={(u) => u.id}
          columns={columns}
          filters={filters}
          searchPlaceholder="Search name or email"
          empty={{ title: "No team members yet", description: "Invite someone to give them access to the admin." }}
        />
      </div>

      {/* Delete Access Management — SUPER_ADMIN only */}
      {isSuperAdmin && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              <h2 className="font-sora font-bold text-base text-navy dark:text-white">Delete Access Control</h2>
            </div>
            <p className="text-xs text-gray-400 font-jakarta">Grant temporary delete permission to team members</p>
          </div>

          {/* Active Permissions */}
          {activePermissions.length > 0 ? (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {activePermissions.map((perm: any) => {
                const isExpired = new Date(perm.canDeleteUntil) < new Date();
                return (
                  <div key={perm.id} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                        <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{perm.name}</p>
                        <p className="text-xs text-gray-400">{perm.email} · {perm.role?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${isExpired ? 'text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {isExpired ? 'Expired' : 'Active'}
                        </p>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires: {new Date(perm.canDeleteUntil).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          await revokeDeleteAccessAction(perm.id);
                          const updated = await getDeletePermissionsAction();
                          setActivePermissions(updated);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-6 text-center text-sm text-gray-400 font-jakarta">
              No active delete permissions. Only you (Super Admin) can delete records.
            </div>
          )}

          {/* Quick Grant Section */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-3">
              Grant temporary delete access to a team member. Access auto-expires after the specified duration.
            </p>
            <div className="flex flex-wrap gap-2">
              {initialUsers
                .filter(u => u.role !== 'SUPER_ADMIN' && u.status === 'ACTIVE')
                .map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setGrantModal(u); setGrantHours('24'); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors text-gray-600 dark:text-gray-400"
                  >
                    <Key className="w-3 h-3" />
                    {u.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Grant Delete Access Modal */}
      {grantModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Grant Delete Access</h3>
              <button onClick={() => setGrantModal(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-300 font-jakarta">
                  Granting delete access to <strong>{grantModal.name}</strong> ({grantModal.role.replace(/_/g, ' ')}). 
                  This is temporary and will auto-expire.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Duration</label>
                <select
                  value={grantHours}
                  onChange={(e) => setGrantHours(e.target.value)}
                  className="input-field text-sm w-full"
                >
                  <option value="1">1 hour</option>
                  <option value="2">2 hours</option>
                  <option value="4">4 hours</option>
                  <option value="8">8 hours (1 work day)</option>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                  <option value="72">72 hours (3 days)</option>
                  <option value="168">7 days</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setGrantModal(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setGrantSubmitting(true);
                    const result = await grantDeleteAccessAction(grantModal.id, parseInt(grantHours));
                    if (result.success) {
                      setGrantModal(null);
                      const updated = await getDeletePermissionsAction();
                      setActivePermissions(updated);
                    } else {
                      notify(result.error);
                    }
                    setGrantSubmitting(false);
                  }}
                  disabled={grantSubmitting}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  {grantSubmitting ? 'Granting...' : 'Grant Access'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalOpen && editing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">
                {editing.id ? "Edit Member" : "Invite New Member"}
              </h2>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setEditing(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                  Full Name *
                </label>
                <input
                  type="text"
                  className="input-field text-sm w-full"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="e.g. Priya Sharma"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                  Email *
                </label>
                <input
                  type="email"
                  className="input-field text-sm w-full"
                  value={editing.email}
                  disabled={!!editing.id} // Don't let them change email of existing user
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })
                  }
                  placeholder="name@udyaibase.com"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                  Role
                </label>
                <select
                  className="input-field text-sm w-full"
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value })
                  }
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => {
                  setModalOpen(false);
                  setEditing(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editing.name || !editing.email || isPending}
                className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />{" "}
                {isPending ? "Saving..." : (editing.id ? "Save" : "Send Invite")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">
              Remove Member?
            </h3>
            <p className="text-sm text-gray-500 font-jakarta mt-2">
              This will permanently revoke their access.
            </p>
            <p className="text-xs text-gray-400 font-jakarta mt-3">Type <span className="font-bold text-red-500">DELETE</span> to confirm:</p>
            <input
              type="text"
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              placeholder="Type DELETE"
              className="w-full mt-2 px-4 py-2 text-center text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono tracking-widest"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteTyped(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleDelete(deleteConfirm); setDeleteTyped(''); }}
                disabled={isPending || deleteTyped !== 'DELETE'}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
