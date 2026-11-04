'use client';

import { useState, useEffect } from 'react';
import { Lock, X, AlertTriangle, Shield, Trash2, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Toast from '@/components/Toast';
import TwoFactorSetup from './SecuritySection2FA';
import EmailChangeModal from '@/components/EmailChangeModal';

type ToastType = {
  type: 'success' | 'error' | 'info';
  message: string;
} | null;

export default function SecuritySection() {
  const router = useRouter();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toast, setToast] = useState<ToastType>(null);
  
  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAFetching, setTwoFAFetching] = useState(true);

  // Export data state
  const [exportLoading, setExportLoading] = useState(false);

  // Email change state
  const [showEmailChange, setShowEmailChange] = useState(false);

  // Deactivate account state
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Delete account state
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [hasPassword, setHasPassword] = useState(true);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch current 2FA status on mount
  useEffect(() => {
    const fetch2FAStatus = async () => {
      try {
        const res = await fetch('/api/founder/2fa-status');
        const data = await res.json();
        if (data.success) {
          setTwoFAEnabled(data.enabled);
          setHasPassword(data.hasPassword !== false);
        }
      } catch (error) {
        console.error('Error fetching 2FA status:', error);
      } finally {
        setTwoFAFetching(false);
      }
    };

    fetch2FAStatus();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Trim all password fields to remove accidental whitespace
    const currentPasswordTrimmed = passwordData.currentPassword.trim();
    const newPasswordTrimmed = passwordData.newPassword.trim();
    const confirmPasswordTrimmed = passwordData.confirmPassword.trim();
    
    if (newPasswordTrimmed !== confirmPasswordTrimmed) {
      setToast({ type: 'error', message: 'New passwords do not match' });
      return;
    }

    if (newPasswordTrimmed.length < 8) {
      setToast({ type: 'error', message: 'Password must be at least 8 characters long' });
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await fetch('/api/founder/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPasswordTrimmed,
          newPassword: newPasswordTrimmed,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setToast({ type: 'success', message: '✅ Password changed successfully!' });
        setShowPasswordModal(false);
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to change password' });
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setToast({ type: 'error', message: 'Failed to change password. Please try again.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handle2FAToggle = () => {
    setShow2FAModal(true);
  };

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasPassword && !deactivatePassword) {
      setToast({ type: 'error', message: 'Password is required' });
      return;
    }
    setDeactivateLoading(true);
    try {
      const res = await fetch('/api/founder/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deactivatePassword }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ type: 'success', message: 'Account deactivated. Redirecting...' });
        setTimeout(() => router.push('/auth/login'), 2000);
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to deactivate' });
        setDeactivateLoading(false);
      }
    } catch {
      setToast({ type: 'error', message: 'Failed to deactivate account' });
      setDeactivateLoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (deleteConfirmation !== 'DELETE') {
      setToast({ type: 'error', message: 'Please type DELETE to confirm' });
      return;
    }

    if (hasPassword && !deletePassword) {
      setToast({ type: 'error', message: 'Please enter your password to confirm' });
      return;
    }

    if (!confirm('Are you absolutely sure? This action cannot be undone and all your data will be permanently deleted.')) {
      return;
    }

    setDeleteLoading(true);

    try {
      const res = await fetch('/api/founder/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });

      const data = await res.json();

      if (data.success) {
        setToast({ type: 'success', message: '✅ Account deleted successfully. Redirecting...' });
        // Small delay to show the message before redirect
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to delete account' });
        setDeleteLoading(false);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      setToast({ type: 'error', message: 'Failed to delete account. Please try again.' });
      setDeleteLoading(false);
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-400" />
            <div>
              <h2 className="portal-section-title">
                Security
              </h2>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <button
              onClick={() => setShowPasswordModal(true)}
              className="w-full text-left py-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors last:border-0"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">Change Password</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Update your password</p>
            </button>

            <button
              onClick={() => setShowEmailChange(true)}
              className="w-full text-left py-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors last:border-0"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">Change Email</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Update your account email address</p>
            </button>

            <button
              onClick={() => setShow2FAModal(true)}
              disabled={twoFAFetching}
              className="w-full text-left py-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed last:border-0"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {twoFAFetching ? 'Loading...' : twoFAEnabled ? 'A code from your authenticator app is needed each time you sign in.' : 'Off. Turn this on so a stolen password alone can’t open your account.'}
                  </p>
                </div>
                {!twoFAFetching && twoFAEnabled && (
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium rounded">
                    Enabled
                  </span>
                )}
              </div>
            </button>

            <button
              onClick={async () => {
                setExportLoading(true);
                try {
                  const res = await fetch('/api/founder/export-data');
                  if (!res.ok) { setToast({ type: 'error', message: 'Failed to export data' }); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url;
                  a.download = `udyaibase-founder-data-${new Date().toISOString().split('T')[0]}.json`;
                  a.click(); URL.revokeObjectURL(url);
                  setToast({ type: 'success', message: 'Data exported successfully' });
                } catch { setToast({ type: 'error', message: 'Failed to export data' }); } finally { setExportLoading(false); }
              }}
              disabled={exportLoading}
              className="w-full text-left py-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors disabled:opacity-50"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">{exportLoading ? 'Exporting...' : 'Export Data'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Download all your personal data as JSON (DPDP Act Sec 11)</p>
            </button>

            <button
              onClick={() => setShowDeactivateModal(true)}
              className="w-full text-left py-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Deactivate Account</p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">Temporarily hide your profile — reactivate anytime by logging in</p>
            </button>

            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full text-left py-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors last:border-0"
            >
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete Account</p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">Permanently delete your account and data</p>
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowPasswordModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              </div>
              <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-1">
                Change Password
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Enter your current password and choose a new one
              </p>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 font-jakarta text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 font-jakarta text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 font-jakarta text-sm transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full px-6 py-2.5 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordLoading ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2FA Modal */}
      {show2FAModal && (
        <TwoFactorSetup
          isEnabled={twoFAEnabled}
          onClose={() => setShow2FAModal(false)}
          onSuccess={() => {
            setTwoFAEnabled(!twoFAEnabled);
            setToast({
              type: 'success',
              message: twoFAEnabled ? '✅ 2FA disabled successfully' : '✅ 2FA enabled successfully'
            });
            // Refresh 2FA status
            fetch('/api/founder/2fa-status')
              .then(res => res.json())
              .then(data => {
                if (data.success) setTwoFAEnabled(data.enabled);
              });
          }}
          onError={(message) => {
            setToast({ type: 'error', message });
          }}
        />
      )}

      {/* Deactivate Account Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-amber-200 dark:border-amber-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => { setShowDeactivateModal(false); setDeactivatePassword(''); }}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-semibold text-xl text-amber-600 dark:text-amber-400 mb-1">Deactivate Account</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">You can reactivate anytime by signing in again again.</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-semibold mb-2">This will temporarily:</p>
              <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                <li>Hide your startups from public listings</li>
                <li>Hide your AI tools from public listings</li>
                <li>Log you out of all sessions</li>
              </ul>
            </div>
            <form onSubmit={handleDeactivate} className="space-y-4">
              {hasPassword && (<div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter your password to confirm</label>
                <input type="password" autoComplete="current-password" value={deactivatePassword} onChange={(e) => setDeactivatePassword(e.target.value)} required placeholder="Your account password" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 font-jakarta text-sm transition-all" />
              </div>)}
              <button type="submit" disabled={deactivateLoading || (hasPassword && !deactivatePassword)} className="w-full px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {deactivateLoading ? 'Deactivating...' : 'Deactivate My Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-red-200 dark:border-red-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteConfirmation(''); }}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-semibold text-xl text-red-600 dark:text-red-400 mb-1">
                Delete Account
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                This action cannot be undone. All your data will be permanently deleted.
              </p>
            </div>

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-300 mb-2 font-semibold">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-red-700 dark:text-red-400 space-y-1 list-disc list-inside">
                  <li>Your profile and account data</li>
                  <li>Listings you submitted, your stories and updates, and your photos</li>
                  <li>Your sign-in, unless you also host events with this email</li>
                </ul>
                <p className="text-sm text-red-800 dark:text-red-300 mt-3 mb-1 font-semibold">What stays:</p>
                <ul className="text-sm text-red-700 dark:text-red-400 space-y-1 list-disc list-inside">
                  <li>A listing that was already in our directory stays public, without you as its owner</li>
                  <li>Invoices we must keep by law, and a security log for one year</li>
                </ul>
              </div>

              {hasPassword && (<div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enter your password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 font-jakarta text-sm transition-all"
                  placeholder="Your account password"
                />
              </div>)}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type <span className="font-bold text-red-600">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 font-jakarta text-sm transition-all"
                  placeholder="DELETE"
                />
              </div>

              <button
                type="submit"
                disabled={deleteLoading || deleteConfirmation !== 'DELETE' || (hasPassword && !deletePassword)}
                className="w-full px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting Account...' : 'Delete My Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showEmailChange && (
        <EmailChangeModal
          apiPath="/api/founder/change-email"
          onClose={() => setShowEmailChange(false)}
          onSuccess={(msg) => { setToast({ type: 'success', message: msg }); }}
          onError={(msg) => { setToast({ type: 'error', message: msg }); }}
        />
      )}
    </>
  );
}
