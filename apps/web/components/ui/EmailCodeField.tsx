'use client';

import { useState } from 'react';

export type EmailCode = { otpToken: string; code: string };
export const NO_CODE: EmailCode = { otpToken: '', code: '' };

/**
 * For accounts with no password (Google sign-in): emails a 6-digit code to confirm deactivating or deleting, then
 * takes it. `endpoint` is the route that sends the code: the founder portal's or the site profile's.
 */
export default function EmailCodeField({ action, value, onChange, onError, endpoint = '/api/founder/account-code' }: {
  action: 'deactivate' | 'delete'; value: EmailCode; onChange: (v: EmailCode) => void; onError: (message: string) => void; endpoint?: string;
}) {
  const [sending, setSending] = useState(false);
  const id = `account-code-${action}`;
  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) onChange({ otpToken: data.otpToken, code: '' });
      else onError(data.error || 'Couldn’t send the code. Try again.');
    } catch {
      onError('Couldn’t send the code. Try again.');
    } finally {
      setSending(false);
    }
  };
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code from your email</label>
      {value.otpToken ? (
        <>
          <input
            id={id} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
            value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value.replace(/\D/g, '') })}
            placeholder="6-digit code"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 text-sm tracking-widest"
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            We emailed you a code. It works for 10 minutes.{' '}
            <button type="button" onClick={send} disabled={sending} className="font-semibold underline disabled:opacity-50">{sending ? 'Sending…' : 'Send a new code'}</button>
          </p>
        </>
      ) : (
        <>
          <button id={id} type="button" onClick={send} disabled={sending} className="w-full min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            {sending ? 'Sending…' : 'Email me a code'}
          </button>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">You sign in without a password, so we confirm it’s you with a code sent to your email.</p>
        </>
      )}
    </div>
  );
}
