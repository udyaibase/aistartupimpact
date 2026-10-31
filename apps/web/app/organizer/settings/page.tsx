"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, CreditCard, Globe, Download, Shield } from "lucide-react";
import TwoFactorSetup from '@/components/TwoFactorSetup';
import EmailChangeModal from '@/components/EmailChangeModal';
import CompanyEmailSection from '@/components/CompanyEmailSection';
import PayoutsPanel from '@/components/organizer/PayoutsPanel';

type Tab = "organization" | "preferences" | "payment" | "privacy";

export default function OrganizerSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("organization");
  // Deep link, e.g. /organizer/settings?tab=payment from the event editor.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "payment" || t === "preferences" || t === "privacy" || t === "organization") setTab(t as Tab);
  }, []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Change password state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  // Data & Privacy state
  const [exporting, setExporting] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [show2FA, setShow2FA] = useState(false);

  // Email change state
  const [showEmailChange, setShowEmailChange] = useState(false);

  useEffect(() => {
    fetch('/api/organizer/2fa-status').then(r => r.json()).then(d => { if (d.success) setTwoFAEnabled(d.enabled); }).catch(() => {});
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    if (passwords.newPass.length < 8) { setMsg('Password must be at least 8 characters'); return; }
    if (passwords.newPass !== passwords.confirm) { setMsg('Passwords do not match'); return; }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/organizer/settings/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.newPass }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg('Password changed!');
        setShowPasswordModal(false);
        setPasswords({ current: '', newPass: '', confirm: '' });
        setTimeout(() => setMsg(''), 3000);
      } else { setMsg(data.error || 'Failed to change password'); }
    } catch { setMsg('Failed to change password'); } finally { setChangingPassword(false); }
  };

  // Organization
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");

  // Preferences
  const [notifyHost, setNotifyHost] = useState(true);
  const [notifyCalendar, setNotifyCalendar] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);

  useEffect(() => {
    fetch("/api/organizer/profile").then(r => r.json()).then((res) => {
      if (res.success && res.profile) {
        const p = res.profile;
        setCompany(p.company || "");
        setPhone(p.phone || "");
        setWebsite(p.website || "");
        setLinkedin(p.linkedin || "");
      }
      setLoading(false);
    });
  }, []);

  const saveOrg = async () => {
    setSaving(true); setMsg("");
    const res = await fetch("/api/organizer/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, phone, website, linkedin }),
    });
    const d = await res.json();
    setMsg(d.success ? "Saved!" : d.error || "Failed");
    setSaving(false); setTimeout(() => setMsg(""), 3000);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;

  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder-gray-400";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-200 font-jakarta mb-1.5";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="portal-title">Settings</h1>
          <p className="portal-subtitle">Organizer workspace settings</p>
        </div>
        <Link href="/organizer/profile" className="inline-flex items-center min-h-[40px] text-sm text-brand hover:underline font-semibold">
          Edit profile →
        </Link>
      </div>

      {/* Tabs */}
      <div data-tour="settings-tabs" role="tablist" className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([["organization", "Organization"], ["preferences", "Preferences"], ["payment", "Payment"], ["privacy", "Data & Privacy"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`shrink-0 whitespace-nowrap min-h-[44px] px-4 text-sm font-medium transition-colors relative ${tab === id ? "text-gray-900 dark:text-white" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {label}
            {tab === id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t" />}
          </button>
        ))}
      </div>

      {msg && <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-jakarta ${msg.includes("!") ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-600"}`}>{msg}</div>}

      {/* Organization */}
      {tab === "organization" && (
        <div className="space-y-6">
          <CompanyEmailSection apiBasePath="/api/organizer" />
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <h2 className="portal-eyebrow">Organization details</h2>
            </div>
            <div className="p-4 space-y-4 bg-white dark:bg-gray-950">
              <div>
                <label className={labelClass}>Organization / Company name</label>
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Your organization name (shown on events)" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Contact phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Website</label>
                <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourorg.com" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>LinkedIn</label>
                <input value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="https://linkedin.com/company/..." className={inputClass} />
              </div>
            </div>
          </div>

          <button onClick={saveOrg} disabled={saving} className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-[48px] px-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <h2 className="portal-eyebrow">Connected accounts</h2>
            </div>
            <div className="p-4 bg-white dark:bg-gray-950">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Google</p>
                    <p className="text-xs text-gray-400">Calendar & sign-in</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-full">Connected</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preferences */}
      {tab === "preferences" && (
        <div className="space-y-6">
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <h2 className="portal-eyebrow">Notifications</h2>
            </div>
            <div className="p-4 space-y-2 bg-white dark:bg-gray-950">
              <Toggle label="New registrations" desc="Get notified when someone registers" checked={notifyHost} onChange={setNotifyHost} />
              <Toggle label="Calendar reminders" desc="24h before your events" checked={notifyCalendar} onChange={setNotifyCalendar} />
              <Toggle label="Weekly digest" desc="Summary of event performance" checked={notifyEmail} onChange={setNotifyEmail} />
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <h2 className="portal-eyebrow">Security</h2>
            </div>
            <div className="p-4 bg-white dark:bg-gray-950 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Change email</p>
                  <p className="text-xs text-gray-400">Update your account email address</p>
                </div>
                <button
                  onClick={() => setShowEmailChange(true)}
                  className="min-h-[40px] px-3.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Change
                </button>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Change password</p>
                  <p className="text-xs text-gray-400">Update your account password</p>
                </div>
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="min-h-[40px] px-3.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Change
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Two-factor authentication</p>
                  <p className="text-xs text-gray-400">Add an extra layer of security</p>
                </div>
                <button
                  onClick={() => setShow2FA(true)}
                  className={`min-h-[40px] px-3.5 text-sm font-medium rounded-lg transition-colors ${twoFAEnabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {twoFAEnabled ? 'Enabled' : 'Set up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment */}
      {tab === "payment" && (
        <div className="space-y-6">
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <h2 className="portal-eyebrow flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payouts</h2>
            </div>
            <div className="bg-white dark:bg-gray-950">
              <PayoutsPanel />
            </div>
          </div>
        </div>
      )}

      {/* Data & Privacy */}
      {tab === "privacy" && (
        <div className="space-y-6">
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <h2 className="portal-eyebrow">Export your data</h2>
            </div>
            <div className="p-4 bg-white dark:bg-gray-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Download all your data</p>
                  <p className="text-xs text-gray-400">Profile, events, registrations, and emails as JSON (DPDP Act Sec 11)</p>
                </div>
                <button
                  onClick={async () => {
                    setExporting(true); setMsg('');
                    try {
                      const res = await fetch('/api/organizer/export-data');
                      if (!res.ok) { setMsg('Failed to export data'); return; }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `udyaibase-organizer-data-${new Date().toISOString().split('T')[0]}.json`;
                      a.click(); URL.revokeObjectURL(url);
                      setMsg('Data exported!');
                      setTimeout(() => setMsg(''), 3000);
                    } catch { setMsg('Failed to export data'); } finally { setExporting(false); }
                  }}
                  disabled={exporting}
                  className="flex items-center gap-1.5 min-h-[40px] px-3.5 text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {exporting ? 'Exporting...' : 'Download'}
                </button>
              </div>
            </div>
          </div>

          <div className="border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
              <h2 className="portal-eyebrow text-amber-600 dark:text-amber-400">Deactivate Account</h2>
            </div>
            <div className="p-4 bg-white dark:bg-gray-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Deactivate account</p>
                  <p className="text-xs text-gray-400">Temporarily hide your profile and draft future events. Reactivate anytime by logging in.</p>
                </div>
                <button
                  onClick={() => setShowDeactivateModal(true)}
                  className="min-h-[40px] px-3.5 text-sm font-semibold text-amber-600 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>

          <div className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
              <h2 className="portal-eyebrow text-red-600 dark:text-red-400">Danger Zone</h2>
            </div>
            <div className="p-4 bg-white dark:bg-gray-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
                  <p className="text-xs text-gray-400">Permanently delete your organizer account, events, and all data</p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="min-h-[40px] px-3.5 text-sm font-semibold text-red-600 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800">
            <button
              onClick={() => { setShowPasswordModal(false); setPasswords({ current: '', newPass: '', confirm: '' }); setMsg(''); }}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center mb-5">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1">Change Password</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Enter your current password and choose a new one</p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
                <input type="password" autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                <input type="password" autoComplete="new-password" value={passwords.newPass} onChange={(e) => setPasswords({ ...passwords, newPass: e.target.value })} required minLength={8} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
                <input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} required minLength={8} className={inputClass} />
              </div>
              <button type="submit" disabled={changingPassword} className="w-full min-h-[48px] px-4 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {changingPassword ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Account Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-amber-200 dark:border-amber-800">
            <button
              onClick={() => { setShowDeactivateModal(false); setDeactivatePassword(''); setMsg(''); }}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center mb-5">
              <div className="w-11 h-11 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-semibold text-lg text-amber-600 dark:text-amber-400 mb-1">Deactivate Account</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">You can reactivate anytime by logging in again.</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold mb-1">This will temporarily:</p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
                <li>Hide your organizer profile</li>
                <li>Set future published events to draft</li>
                <li>Log you out of all sessions</li>
              </ul>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault(); setMsg('');
              if (!deactivatePassword) { setMsg('Password is required'); return; }
              setDeactivating(true);
              try {
                const res = await fetch('/api/organizer/deactivate', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: deactivatePassword }),
                });
                const data = await res.json();
                if (data.success) {
                  setMsg('Account deactivated. Redirecting...');
                  setTimeout(() => router.push('/organizer/login'), 2000);
                } else { setMsg(data.error || 'Failed to deactivate'); setDeactivating(false); }
              } catch { setMsg('Failed to deactivate account'); setDeactivating(false); }
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enter your password to confirm</label>
                <input type="password" autoComplete="current-password" value={deactivatePassword} onChange={(e) => setDeactivatePassword(e.target.value)} required placeholder="Your account password" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-jakarta" />
              </div>
              <button type="submit" disabled={deactivating || !deactivatePassword} className="w-full min-h-[48px] px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {deactivating ? 'Deactivating...' : 'Deactivate My Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-200 dark:border-red-800">
            <button
              onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteConfirmation(''); setMsg(''); }}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>

            <div className="text-center mb-5">
              <div className="w-11 h-11 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-red-600 dark:text-red-400 mb-1">Delete Organizer Account</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">This action cannot be undone.</p>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-800 dark:text-red-300 font-semibold mb-1">This will permanently delete:</p>
              <ul className="text-xs text-red-700 dark:text-red-400 space-y-0.5 list-disc list-inside">
                <li>Your organizer profile</li>
                <li>All events you created</li>
                <li>All event registrations</li>
                <li>Newsletter subscription</li>
              </ul>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault(); setMsg('');
              if (deleteConfirmation !== 'DELETE') { setMsg('Please type DELETE to confirm'); return; }
              if (!deletePassword) { setMsg('Password is required'); return; }
              setDeleting(true);
              try {
                const res = await fetch('/api/organizer/delete-account', {
                  method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: deletePassword }),
                });
                const data = await res.json();
                if (data.success) {
                  setMsg('Account deleted! Redirecting...');
                  setTimeout(() => router.push('/'), 2000);
                } else { setMsg(data.error || 'Failed to delete account'); setDeleting(false); }
              } catch { setMsg('Failed to delete account'); setDeleting(false); }
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enter your password</label>
                <input type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required placeholder="Your account password" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type <span className="font-bold text-red-600">DELETE</span> to confirm</label>
                <input type="text" value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} required placeholder="DELETE" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500" />
              </div>
              <button type="submit" disabled={deleting || deleteConfirmation !== 'DELETE' || !deletePassword} className="w-full min-h-[48px] px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {deleting ? 'Deleting Account...' : 'Delete My Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {show2FA && (
        <TwoFactorSetup
          isEnabled={twoFAEnabled}
          apiBasePath="/api/organizer"
          onClose={() => setShow2FA(false)}
          onSuccess={() => { setTwoFAEnabled(!twoFAEnabled); setMsg(twoFAEnabled ? '2FA disabled' : '2FA enabled!'); setTimeout(() => setMsg(''), 3000); }}
          onError={(m) => { setMsg(m); setTimeout(() => setMsg(''), 5000); }}
        />
      )}

      {showEmailChange && (
        <EmailChangeModal
          apiPath="/api/organizer/change-email"
          onClose={() => setShowEmailChange(false)}
          onSuccess={(m) => { setMsg(m); setTimeout(() => setMsg(''), 5000); }}
          onError={(m) => { setMsg(m); setTimeout(() => setMsg(''), 5000); }}
        />
      )}
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 cursor-pointer" onClick={() => onChange(!checked)}>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${checked ? "bg-brand" : "bg-gray-300 dark:bg-gray-600"}`}>
        <div className={`absolute top-[3px] w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
      </div>
    </div>
  );
}
