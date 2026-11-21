'use client';

import { useState, useEffect } from 'react';
import { BadgeCheck, Loader2, Mail, ShieldCheck, ArrowRight } from 'lucide-react';
import CodeInput from '@/components/ui/CodeInput';

interface CompanyEmailSectionProps {
  apiBasePath: '/api/founder' | '/api/organizer';
}

type Step = 'loading' | 'idle' | 'sending' | 'otp_sent' | 'verifying' | 'verified';

export default function CompanyEmailSection({ apiBasePath }: CompanyEmailSectionProps) {
  const [step, setStep] = useState<Step>('loading');
  const [companyEmail, setCompanyEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    fetch(`${apiBasePath}/company-email/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          if (data.companyEmailVerified) {
            setStep('verified');
            setSavedEmail(data.companyEmail || '');
            setVerifiedAt(data.companyEmailVerifiedAt);
          } else {
            setStep('idle');
            if (data.companyEmail) {
              setCompanyEmail(data.companyEmail);
              setSavedEmail(data.companyEmail);
            }
          }
        } else {
          setStep('idle');
        }
      })
      .catch(() => setStep('idle'));
  }, [apiBasePath]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendOtp = async () => {
    setError('');
    setStep('sending');
    try {
      const res = await fetch(`${apiBasePath}/company-email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send code.');
      setSavedEmail(companyEmail);
      setStep('otp_sent');
      setCountdown(60);
    } catch (err: any) {
      setError(err.message);
      setStep('idle');
    }
  };

  const handleVerify = async () => {
    setError('');
    setStep('verifying');
    try {
      const res = await fetch(`${apiBasePath}/company-email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Verification failed.');
      setStep('verified');
      setVerifiedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err.message);
      setStep('otp_sent');
    }
  };

  if (step === 'loading') {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading verification status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Company Email Verification</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Verify your company email to get a Verified badge</p>
        </div>
      </div>

      {step === 'verified' ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50">
          <BadgeCheck className="w-5 h-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Verified</p>
            <p className="text-xs text-green-600 dark:text-green-500">
              {savedEmail}
              {verifiedAt && <> &middot; Verified {new Date(verifiedAt).toLocaleDateString()}</>}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {step !== 'otp_sent' && step !== 'verifying' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Company Email Address
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      aria-label="Company email address"
                      autoComplete="email"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      placeholder="you@yourcompany.com"
                      className="w-full h-11 pl-10 pr-4 border border-gray-300 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={handleSendOtp}
                    disabled={!companyEmail || step === 'sending'}
                    className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-md bg-brand hover:bg-brand/90 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {step === 'sending' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                    ) : (
                      <>Send Code <ArrowRight className="w-3.5 h-3.5" /></>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  Use your company email (not Gmail, Yahoo, etc.) to get a Verified badge.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Enter the 6-digit code sent to <span className="block font-semibold text-gray-900 dark:text-white truncate">{savedEmail}</span>
              </p>
              <CodeInput autoFocus value={otpCode} onChange={setOtpCode} label="Verification code" />
              <button
                onClick={handleVerify}
                disabled={otpCode.length !== 6 || step === 'verifying'}
                className="w-full h-11 bg-brand hover:bg-brand/90 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {step === 'verifying' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                ) : (
                  <>Verify & Get Badge <BadgeCheck className="w-4 h-4" /></>
                )}
              </button>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleSendOtp}
                  disabled={countdown > 0}
                  className="text-xs text-brand hover:underline disabled:text-gray-400 disabled:no-underline"
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                </button>
                <button
                  onClick={() => { setStep('idle'); setOtpCode(''); setError(''); }}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Change email
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
