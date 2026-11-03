'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Download, Loader2, Shield } from 'lucide-react';
import TwoFactorSetup from '@/components/TwoFactorSetup';
import EmailChangeModal from '@/components/EmailChangeModal';

export default function EmployerSettingsPage() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Change password state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [show2FA, setShow2FA] = useState(false);

  // Email change state
  const [showEmailChange, setShowEmailChange] = useState(false);

  useEffect(() => {
    fetch('/api/employer/2fa-status').then(r => r.json()).then(d => { if (d.success) setTwoFAEnabled(d.enabled); }).catch(() => {});
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (passwords.newPass.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (passwords.newPass !== passwords.confirm) { setError('Passwords do not match'); return; }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/employer/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.newPass }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Password changed successfully');
        setShowPasswordModal(false);
        setPasswords({ current: '', newPass: '', confirm: '' });
        setTimeout(() => setSuccess(''), 3000);
      } else { setError(data.error || 'Failed to change password'); }
    } catch { setError('Failed to change password'); } finally { setChangingPassword(false); }
  };

  const handleExport = async () => {
    setExporting(true); setError('');
    try {
      const res = await fetch('/api/employer/export-data');
      if (!res.ok) { setError('Failed to export data'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `udyaibase-employer-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      setSuccess('Data exported successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch { setError('Failed to export data'); } finally { setExporting(false); }
  };

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!deactivatePassword) { setError('Password is required'); return; }
    setDeactivating(true);
    try {
      const res = await fetch('/api/employer/deactivate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deactivatePassword }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Account deactivated. Redirecting...');
        setTimeout(() => router.push('/employer/login'), 2000);
      } else { setError(data.error || 'Failed to deactivate account'); setDeactivating(false); }
    } catch { setError('Failed to deactivate account'); setDeactivating(false); }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (deleteConfirmation !== 'DELETE') { setError('Please type DELETE to confirm'); return; }
    if (!deletePassword) { setError('Password is required'); return; }
    setDeleting(true);
    try {
      const res = await fetch('/api/employer/delete-account', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Account deleted. Redirecting...');
        setTimeout(() => router.push('/'), 2000);
      } else { setError(data.error || 'Failed to delete account'); setDeleting(false); }
    } catch { setError('Failed to delete account'); setDeleting(false); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-5 h-5 text-brand" />
        <h1 className="font-sora font-extrabold text-xl text-navy dark:text-white">Settings</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm font-jakarta bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm font-jakarta bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
          {success}
        </div>
      )}

      <div className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Email</label>
            <p className="text-xs text-gray-400 font-jakarta mt-1">Change your account email address</p>
          </div>
          <button
            onClick={() => setShowEmailChange(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Change
          </button>
        </div>

        {/* Security */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">Security</h3>
          <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-medium text-navy dark:text-white font-jakarta">Change password</p>
              <p className="text-xs text-gray-500 font-jakarta">Update your account password</p>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Change
            </button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-navy dark:text-white font-jakarta">Two-factor authentication</p>
              <p className="text-xs text-gray-500 font-jakarta">Add an extra layer of security</p>
            </div>
            <button
              onClick={() => setShow2FA(true)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${twoFAEnabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {twoFAEnabled ? 'Enabled' : 'Set up'}
            </button>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">Data & Privacy</h3>
          <p className="text-xs text-gray-500 font-jakarta mb-3">
            Under the DPDP Act, you have the right to access and export your personal data, or delete your account entirely.
          </p>

          <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-medium text-navy dark:text-white font-jakarta">Export your data</p>
              <p className="text-xs text-gray-500 font-jakarta">Download company profile, job listings, and applications as JSON</p>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? 'Exporting...' : 'Download'}
            </button>
          </div>
        </div>

        {/* Deactivate Account */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="font-sora font-bold text-sm text-amber-600 dark:text-amber-400 mb-3">Deactivate Account</h3>
          <p className="text-xs text-gray-500 font-jakarta mb-3">
            Temporarily hide your profile and close all active job listings. You can reactivate anytime by logging in again.
          </p>
          <button
            onClick={() => setShowDeactivateModal(true)}
            className="text-sm font-semibold text-amber-600 hover:text-amber-700 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            Deactivate Account
          </button>
        </div>

        {/* Danger Zone */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="font-sora font-bold text-sm text-red-600 dark:text-red-400 mb-3">Danger Zone</h3>
          <p className="text-xs text-gray-500 font-jakarta mb-3">
            Deleting your account will remove all your job listings and application data permanently.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="text-sm font-semibold text-red-600 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800">
            <button
              onClick={() => { setShowPasswordModal(false); setPasswords({ current: '', newPass: '', confirm: '' }); setError(''); }}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center mb-5">
              <h3 className="font-semibold text-lg text-navy dark:text-white mb-1">Change Password</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Enter your current password and choose a new one</p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
                <input type="password" autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} required className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand font-jakarta" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                <input type="password" autoComplete="new-password" value={passwords.newPass} onChange={(e) => setPasswords({ ...passwords, newPass: e.target.value })} required minLength={8} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand font-jakarta" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
                <input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} required minLength={8} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand font-jakarta" />
              </div>
              <button type="submit" disabled={changingPassword} className="w-full px-4 py-2 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
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
              onClick={() => { setShowDeactivateModal(false); setDeactivatePassword(''); setError(''); }}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center mb-5">
              <div className="w-11 h-11 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-amber-600 dark:text-amber-400 mb-1">Deactivate Account</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">You can reactivate anytime by logging in again.</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold mb-1">This will temporarily:</p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
                <li>Hide your employer profile</li>
                <li>Close all active job listings</li>
                <li>Log you out of all sessions</li>
              </ul>
            </div>
            <form onSubmit={handleDeactivate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enter your password to confirm</label>
                <input type="password" autoComplete="current-password" value={deactivatePassword} onChange={(e) => setDeactivatePassword(e.target.value)} required placeholder="Your account password" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-jakarta" />
              </div>
              <button type="submit" disabled={deactivating || !deactivatePassword} className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
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
              onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteConfirmation(''); setError(''); }}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>

            <div className="text-center mb-5">
              <div className="w-11 h-11 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-red-600 dark:text-red-400 mb-1">Delete Employer Account</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">This action cannot be undone.</p>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-800 dark:text-red-300 font-semibold mb-1">This will permanently delete:</p>
              <ul className="text-xs text-red-700 dark:text-red-400 space-y-0.5 list-disc list-inside">
                <li>Your company profile</li>
                <li>All job listings</li>
                <li>All applications received</li>
                <li>Newsletter subscription</li>
              </ul>
            </div>

            <form onSubmit={handleDelete} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enter your password</label>
                <input type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required placeholder="Your account password" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-jakarta" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type <span className="font-bold text-red-600">DELETE</span> to confirm</label>
                <input type="text" value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} required placeholder="DELETE" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-jakarta" />
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
          apiBasePath="/api/employer"
          onClose={() => setShow2FA(false)}
          onSuccess={() => { setTwoFAEnabled(!twoFAEnabled); setSuccess(twoFAEnabled ? '2FA disabled' : '2FA enabled successfully'); setTimeout(() => setSuccess(''), 3000); }}
          onError={(msg) => { setError(msg); setTimeout(() => setError(''), 5000); }}
        />
      )}

      {showEmailChange && (
        <EmailChangeModal
          apiPath="/api/employer/change-email"
          onClose={() => setShowEmailChange(false)}
          onSuccess={(msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 5000); }}
          onError={(msg) => { setError(msg); setTimeout(() => setError(''), 5000); }}
        />
      )}
    </div>
  );
}
