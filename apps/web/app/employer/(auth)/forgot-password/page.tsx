'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/employer/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSent(true);
      else setError('Failed to send reset email');
    } catch { setError('Something went wrong'); }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-page dark:bg-page-dark flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white mb-2">Check Your Email</h1>
          <p className="text-sm text-gray-500 font-jakarta mb-6">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. It expires in 1 hour.
          </p>
          <Link href="/employer/login" className="text-brand text-sm font-semibold font-jakarta hover:underline">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page dark:bg-page-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">Reset Password</h1>
          <p className="text-sm text-gray-500 font-jakarta mt-2">Enter your email and we&apos;ll send a reset link</p>
        </div>

        <div className="card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="company@example.com" required className="input-field pl-10 w-full" autoFocus />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-brand w-full py-3 disabled:opacity-50">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p className="text-center mt-4">
            <Link href="/employer/login" className="text-xs text-gray-500 font-jakarta hover:text-brand inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
