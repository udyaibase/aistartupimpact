'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, Camera, Check, Eye, EyeOff, Shield, Monitor, Smartphone, Globe, X } from 'lucide-react';
import { maskEmail } from '@/lib/mask';
import SavedItems from '@/components/profile/SavedItems';
import TwoFactorSetup from '@/components/TwoFactorSetup';
import EmailChangeModal from '@/components/EmailChangeModal';
import PreferencesClient from '@/app/settings/preferences/PreferencesClient';
import { getPreferencesForm } from '@/app/settings/preferences/actions';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar: string | null;
  twitter: string | null;
  linkedin: string | null;
  createdAt: string;
  founderId?: string | null;
  organizerId?: string | null;
}

type Tab = 'overview' | 'security' | 'workspaces' | 'preferences';

interface ProfileContentProps {
  /** Show back button */
  showBack?: boolean;
}

export default function ProfileContent({ showBack = true }: ProfileContentProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    fetchProfile();
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#security') setTab('security');
      if (window.location.hash === '#workspaces') setTab('workspaces');
      if (window.location.hash === '#preferences') setTab('preferences');
    }
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/user/session');
      if (res.ok) {
        const data = await res.json();
        if (data.user) { setProfile(data.user); }
        else { router.push('/'); }
      } else { router.push('/'); }
    } catch { router.push('/'); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;
  if (!profile) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'security', label: 'Security' },
    { key: 'workspaces', label: 'Workspaces' },
    { key: 'preferences', label: 'Preferences' },
  ];

  return (
    // showBack means it's inside a portal, which sets the page width; the public page has no sidebar, so stays narrow.
    <div className={showBack ? undefined : 'max-w-3xl mx-auto'}>
      {showBack && (
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 -ml-1 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          Back
        </button>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-4 py-2.5 text-sm font-medium transition-colors relative ${tab === t.key ? 'text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.label}
            {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab profile={profile} setProfile={setProfile} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'workspaces' && <WorkspacesTab profile={profile} />}
      {tab === 'preferences' && <PreferencesTab />}
    </div>
  );
}

// ─── Preferences Tab ──────────────────────────────

function PreferencesTab() {
  const [form, setForm] = useState<Awaited<ReturnType<typeof getPreferencesForm>>>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    getPreferencesForm()
      .then((data) => { setForm(data); setState(data ? 'ready' : 'error'); })
      .catch(() => setState('error'));
  }, []);

  if (state === 'loading') return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;
  if (!form) return <p role="alert" className="text-sm text-gray-600 dark:text-gray-400">Couldn’t load your preferences. Please refresh the page and try again.</p>;
  return (
    <div>
      <p className="text-sm text-gray-500 mb-6">Customize your feed and recommendations</p>
      <PreferencesClient categories={form.categories} initialPrefs={form.prefs} />
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────

function OverviewTab({ profile, setProfile }: { profile: UserProfile; setProfile: (p: UserProfile) => void }) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: profile.name || '', bio: profile.bio || '', twitter: profile.twitter || '', linkedin: profile.linkedin || '',
    instagram: (profile as any).instagram || '', facebook: (profile as any).facebook || '', github: (profile as any).github || '',
  });

  const handleSave = async () => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const res = await fetch('/api/user/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) { setProfile({ ...profile, ...data.user }); setSuccess('Saved'); setTimeout(() => setSuccess(''), 2000); }
      else { setError(data.error || 'Failed'); }
    } catch { setError('Failed to save'); } finally { setSaving(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Max 2MB'); return; }
    setUploadingAvatar(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'avatar');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
      const res = await fetch('/api/user/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: uploadData.url }) });
      if (res.ok) { const d = await res.json(); setProfile({ ...profile, avatar: uploadData.url, ...d.user }); setSuccess('Avatar updated'); setTimeout(() => setSuccess(''), 2000); }
    } catch (err: any) { setError(err.message); } finally { setUploadingAvatar(false); }
  };

  return (
    <div className="space-y-6">
      {error && <Msg type="error">{error}</Msg>}
      {success && <Msg type="success">{success}</Msg>}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden border-2 border-gray-200 dark:border-gray-700">
            {profile.avatar ? <Image src={profile.avatar} alt="" className="w-full h-full object-cover" width={64} height={64} sizes="64px" /> : <span className="text-xl font-bold text-gray-400">{(profile.name || 'U').charAt(0)}</span>}
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploadingAvatar} className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Camera className="w-4 h-4 text-white" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        <div><p className="text-sm font-medium text-gray-900 dark:text-white">{profile.name}</p><p className="text-xs text-gray-500">{maskEmail(profile.email)}</p></div>
      </div>
      <Section title="Personal">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} maxLength={100} />
        <Field label="Bio" value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} multiline placeholder="Tell us about yourself" maxLength={500} />
      </Section>
      <Section title="Social links"><SocialLinksEditor form={form} setForm={setForm} /></Section>
      <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center gap-2">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save changes'}
      </button>
      <Section title="Saved items"><SavedItems /></Section>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────

function SecurityTab() {
  const router = useRouter();
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [hasPassword, setHasPassword] = useState(true);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user/2fa-status').then(r => r.json()).then(d => { if (d.success && d.hasPassword === false) setHasPassword(false); if (d.success) setTwoFAEnabled(d.enabled); }).catch(() => {});
    fetch('/api/user/sessions').then(r => r.json()).then(d => { if (d.sessions) setSessions(d.sessions); }).catch(() => {}).finally(() => setSessionsLoading(false));
  }, []);

  const revokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      const res = await fetch('/api/user/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      if (res.ok) setSessions(s => s.filter(x => x.id !== sessionId));
      else { const d = await res.json(); setError(d.error || 'Failed to revoke session'); }
    } catch { setError('Failed to revoke session'); }
    finally { setRevokingId(null); }
  };

  const handleChangePassword = async () => {
    setError(''); setSuccess('');
    if (passwords.newPass.length < 8) { setError('Min 8 characters'); return; }
    if (passwords.newPass !== passwords.confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.newPass }) });
      const data = await res.json();
      if (res.ok) { setSuccess('Password updated'); setChangingPassword(false); setPasswords({ current: '', newPass: '', confirm: '' }); setTimeout(() => setSuccess(''), 3000); }
      else { setError(data.error || 'Failed'); }
    } catch { setError('Failed'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {error && <Msg type="error">{error}</Msg>}
      {success && <Msg type="success">{success}</Msg>}
      <Section title="Password">
        {!changingPassword ? (
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-700 dark:text-gray-300">Password</p><p className="text-xs text-gray-500">Change your account password</p></div>
            <button onClick={() => setChangingPassword(true)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Change</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative"><input type={showCurrent ? 'text' : 'password'} autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} placeholder="Current password" className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white" /><button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
            <div className="relative"><input type={showNew ? 'text' : 'password'} autoComplete="new-password" value={passwords.newPass} onChange={(e) => setPasswords({ ...passwords, newPass: e.target.value })} placeholder="New password (min 8)" className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white" /><button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
            <input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} placeholder="Confirm new password" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
            <div className="flex gap-2">
              <button onClick={handleChangePassword} disabled={saving} className="px-4 py-2 text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg disabled:opacity-50">{saving ? 'Updating...' : 'Update'}</button>
              <button onClick={() => { setChangingPassword(false); setPasswords({ current: '', newPass: '', confirm: '' }); setError(''); }} className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          </div>
        )}
      </Section>
      <Section title="Email">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-gray-700 dark:text-gray-300">Change email</p><p className="text-xs text-gray-500">Update your account email address</p></div>
          <button onClick={() => setShowEmailChange(true)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Change</button>
        </div>
      </Section>
      <Section title="Two-factor authentication">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-gray-700 dark:text-gray-300">Authenticator app</p><p className="text-xs text-gray-500">Extra security layer</p></div>
          <button onClick={() => setShow2FA(true)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${twoFAEnabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {twoFAEnabled ? 'Enabled' : 'Set up'}
          </button>
        </div>
      </Section>
      <Section title="Sessions">
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No active sessions found</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const ua = s.userAgent || '';
              const isMobile = /mobile|android|iphone|ipad/i.test(ua);
              const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|Brave)[\/\s]([\d.]+)/)?.[1] || 'Browser';
              const os = ua.match(/(Windows|Mac OS X|Linux|Android|iOS|iPhone OS)[\/\s]?([\d._]*)/)?.[1]?.replace('_', '.') || '';
              return (
                <div key={s.id} className={`flex items-center justify-between p-3 rounded-lg border ${s.isCurrent ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.isCurrent ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                      {isMobile ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {browser}{os ? ` on ${os}` : ''}{s.isCurrent ? ' (this device)' : ''}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{s.ipAddress || 'Unknown'}</span>
                        <span>·</span>
                        <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <button
                      onClick={() => revokeSession(s.id)}
                      disabled={revokingId === s.id}
                      className="ml-2 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                      title="Revoke session"
                    >
                      {revokingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Data & Privacy">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Export your data</p>
              <p className="text-xs text-gray-500">Download all your personal data as JSON (DPDP Act Sec 11)</p>
            </div>
            <button
              onClick={async () => {
                setExporting(true); setError('');
                try {
                  const res = await fetch('/api/user/export-data');
                  if (!res.ok) { setError('Failed to export data'); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url;
                  a.download = `udyaibase-user-data-${new Date().toISOString().split('T')[0]}.json`;
                  a.click(); URL.revokeObjectURL(url);
                  setSuccess('Data exported successfully'); setTimeout(() => setSuccess(''), 3000);
                } catch { setError('Failed to export data'); } finally { setExporting(false); }
              }}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Download'}
            </button>
          </div>

          <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400">Delete account</p>
                <p className="text-xs text-gray-500">Permanently delete your account and all data</p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </Section>

      {showDeleteModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-200 dark:border-red-800">
            <button onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteConfirmation(''); }} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center mb-5">
              <div className="w-11 h-11 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-red-600 dark:text-red-400 mb-1">Delete Account</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">This action cannot be undone. All your data will be permanently deleted.</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-800 dark:text-red-300 font-semibold mb-1">This will permanently delete:</p>
              <ul className="text-xs text-red-700 dark:text-red-400 space-y-0.5 list-disc list-inside">
                <li>Your profile and account data</li>
                <li>Your startup reviews and saved jobs</li>
                <li>Your founder account, if you have one (see Founder Settings for what stays)</li>
                <li>Newsletter subscription</li>
              </ul>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault(); setError('');
              if (deleteConfirmation !== 'DELETE') { setError('Please type DELETE to confirm'); return; }
              if (hasPassword && !deletePassword) { setError('Password is required'); return; }
              setDeleting(true);
              try {
                const res = await fetch('/api/user/delete-account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: deletePassword }) });
                const data = await res.json();
                if (data.success) { setSuccess('Account deleted. Redirecting...'); setTimeout(() => router.push('/'), 2000); }
                else { setError(data.error || 'Failed to delete account'); setDeleting(false); }
              } catch { setError('Failed to delete account'); setDeleting(false); }
            }} className="space-y-3">
              {hasPassword && (<div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enter your password</label>
                <input type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required placeholder="Your account password" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500" />
              </div>)}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type <span className="font-bold text-red-600">DELETE</span> to confirm</label>
                <input type="text" value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} required placeholder="DELETE" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500" />
              </div>
              <button type="submit" disabled={deleting || deleteConfirmation !== 'DELETE' || !deletePassword} className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {deleting ? 'Deleting Account...' : 'Delete My Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {show2FA && (
        <TwoFactorSetup
          isEnabled={twoFAEnabled}
          apiBasePath="/api/user"
          onClose={() => setShow2FA(false)}
          onSuccess={() => { setTwoFAEnabled(!twoFAEnabled); setSuccess(twoFAEnabled ? '2FA disabled' : '2FA enabled successfully'); setTimeout(() => setSuccess(''), 3000); }}
          onError={(msg) => { setError(msg); setTimeout(() => setError(''), 5000); }}
        />
      )}

      {showEmailChange && (
        <EmailChangeModal
          apiPath="/api/user/change-email"
          onClose={() => setShowEmailChange(false)}
          onSuccess={(msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 5000); }}
          onError={(msg) => { setError(msg); setTimeout(() => setError(''), 5000); }}
        />
      )}
    </div>
  );
}

// ─── Workspaces Tab ───────────────────────────────

function WorkspacesTab({ profile }: { profile: UserProfile }) {
  return (
    <div className="space-y-6">
      <Section title="Your workspaces">
        <div className="space-y-3">
          <WorkspaceRow label="Community" description="Stories, tools, startups, events" active={true} href="/" />
          <WorkspaceRow label="Founder" description={profile.founderId ? "Startups, tools, team" : "Submit a startup to activate"} active={!!profile.founderId} href="/founder/dashboard" />
          <WorkspaceRow label="Organizer" description={profile.organizerId ? "Events, attendees, check-in" : "Create an event to activate"} active={!!profile.organizerId} href="/organizer" />
        </div>
      </Section>
      <Section title="Account">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="font-medium text-gray-900 dark:text-white">{profile.email}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Member since</span><span className="font-medium text-gray-900 dark:text-white">{new Date(profile.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
        </div>
      </Section>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="border border-gray-200 dark:border-gray-800 rounded-xl"><div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 rounded-t-xl"><h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2></div><div className="p-4 space-y-4 bg-white dark:bg-gray-950 rounded-b-xl">{children}</div></div>);
}
function Field({ label, value, onChange, placeholder, multiline, maxLength }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; maxLength?: number }) {
  return (<div><label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}{maxLength ? <span className="text-xs text-gray-400 ml-2">{value.length}/{maxLength}</span> : null}</label>{multiline ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} maxLength={maxLength} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none" /> : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-brand/30 focus:border-brand" />}</div>);
}
function WorkspaceRow({ label, active, href, description }: { label: string; active: boolean; href: string; description: string }) {
  return (<div className="flex items-center justify-between py-2"><div><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-300'}`} /><p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p></div><p className="text-xs text-gray-500 ml-4">{description}</p></div>{active ? <Link href={href} className="px-3 py-1.5 text-xs font-medium text-brand bg-brand/5 rounded-lg hover:bg-brand/10 transition-colors">Open</Link> : <span className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg">Inactive</span>}</div>);
}
function SocialLinksEditor({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<string[]>(() => ['linkedin', 'twitter', 'instagram', 'facebook', 'github'].filter(p => form[p] && form[p].trim()));
  const PLATFORMS = [
    { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/yourname' },
    { key: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/yourhandle' },
    { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
    { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
    { key: 'github', label: 'GitHub', placeholder: 'https://github.com/yourusername' },
  ];
  const activeLinks = PLATFORMS.filter(p => activePlatforms.includes(p.key));
  const availableToAdd = PLATFORMS.filter(p => !activePlatforms.includes(p.key));
  return (
    <div className="space-y-3">
      {activeLinks.map(p => (<div key={p.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2"><span className="text-xs font-medium text-gray-500 sm:w-20 shrink-0">{p.label}</span><div className="flex items-center gap-2 flex-1 min-w-0"><input type="url" value={form[p.key] || ''} onChange={(e) => setForm({ ...form, [p.key]: e.target.value })} placeholder={p.placeholder} className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-brand/30 focus:border-brand" /><button onClick={() => { setActivePlatforms(activePlatforms.filter(k => k !== p.key)); setForm({ ...form, [p.key]: '' }); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button></div></div>))}
      {availableToAdd.length > 0 && (<div className="relative"><button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>Add link</button>{showAdd && (<div className="absolute left-0 top-full mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-10 py-1">{availableToAdd.map(p => (<button key={p.key} onClick={() => { setActivePlatforms([...activePlatforms, p.key]); setShowAdd(false); }} className="block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">{p.label}</button>))}</div>)}</div>)}
      {activeLinks.length === 0 && !showAdd && <p className="text-xs text-gray-400">No social links added yet</p>}
    </div>
  );
}
function Msg({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  return (<div className={`p-3 border rounded-lg text-sm flex items-center gap-2 ${type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400'}`}>{type === 'success' && <Check className="w-4 h-4" />}{children}</div>);
}
