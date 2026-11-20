'use client';

import { useState } from 'react';
import { Mail, X, Loader2 } from 'lucide-react';

interface EmailChangeModalProps {
  apiPath: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export default function EmailChangeModal({ apiPath, onClose, onSuccess, onError }: EmailChangeModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) { onError('Please enter a valid email'); return; }
    if (!password) { onError('Password is required'); return; }
    setLoading(true);
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail, password }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.message || `Verification email sent to ${newEmail}. Check your inbox.`);
        onClose();
      } else {
        onError(data.error || 'Failed to initiate email change');
      }
    } catch {
      onError('Failed to initiate email change');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-2">Change Email Address</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">We'll send a verification link to your new email</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">New Email Address</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="newemail@example.com"
              className="w-full px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="email-change-password" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Current password</label>
            <input
              id="email-change-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              className="w-full px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !newEmail || !password}
            className="w-full px-6 py-3 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending verification...</span>
            ) : 'Send Verification Email'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-4">
          The verification link expires in 24 hours. Your email won't change until you click the link.
        </p>
      </div>
    </div>
  );
}
