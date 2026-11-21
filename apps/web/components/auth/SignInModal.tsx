'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Loader2, Mail } from 'lucide-react';
import CodeInput from '@/components/ui/CodeInput';
import { CONTROL_FIELD, CONTROL_LABEL, CONTROL_LINK, CONTROL_OUTLINE, CONTROL_PRIMARY } from '@/lib/ui/form-controls';
import PasswordField from '@/components/ui/PasswordField';
import { passwordProblem } from '@/lib/password-rules';
import { useRouter } from 'next/navigation';
import TurnstileWidget from '@/components/shared/TurnstileWidget';
import CandidateSignIn from '@/components/jobs/CandidateSignIn';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
  defaultTab?: 'user' | 'founder';
  returnTo?: string | null;
  fullPage?: boolean;
  embedded?: boolean;
}

type ModeType = 'signin' | 'signup';

export default function SignInModal({ isOpen, onClose, defaultMode = 'signin', defaultTab = 'user', returnTo, fullPage = false, embedded = false }: SignInModalProps) {
  const router = useRouter();
  // Where to go after signing in: the page asked for, else the page the modal was opened on. Never a sign-in page
  // itself (on /auth/login that used to send people straight back to the sign-in form).
  const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : null;
  const candidate = returnTo || here;
  const effectiveReturnTo = candidate && candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.startsWith('/auth/') ? candidate : null;
  const [mode, setMode] = useState<ModeType>(defaultMode);
  const [codeSignIn, setCodeSignIn] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: '',
    agreeToTerms: false,
    subscribeNewsletter: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const turnstileToken = useRef('');

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFAUserType, setTwoFAUserType] = useState<string>('founder');

  // Arriving from Google with 2FA on: the callback passes the challenge in the URL fragment. Clear it straight away.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash.startsWith('#twofa=')) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const challenge = params.get('twofa');
    const type = params.get('type');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (challenge && (type === 'webuser' || type === 'founder' || type === 'organizer')) {
      setChallengeToken(challenge);
      setTwoFAUserType(type);
      setRequires2FA(true);
    }
  }, []);

  // OTP verification state (for signup)
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpWrong, setOtpWrong] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  // When the code step opens, bring its button into view too (on short screens it sat below the visible area).
  useEffect(() => {
    if (otpStep) requestAnimationFrame(() => submitRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [otpStep]);
  const [otpSending, setOtpSending] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  if (!isOpen) return null;

  const resetForm = () => {
    setCodeSignIn(false);
    setTermsError(false);
    setFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      company: '',
      agreeToTerms: false,
      subscribeNewsletter: false,
    });
    setError('');
    setShowResendVerification(false);
    setResendSuccess(false);
    setRequires2FA(false);
    setTwoFACode('');
    setChallengeToken('');
    setTwoFAUserType('founder');
    setOtpStep(false);
    setOtpCode('');
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowResendVerification(false);

    if (mode === 'signup') {
      if (!formData.name || formData.name.length < 2) {
        setError('Name must be at least 2 characters');
        return;
      }
      const pwProblem = passwordProblem(formData.password, formData.email, 'mixed', formData.name);
      if (pwProblem) {
        setError(pwProblem);
        return;
      }
      if (!formData.agreeToTerms) {
        setTermsError(true); // shown next to the checkbox, where the fix is
        document.getElementById('modal-terms')?.focus();
        return;
      }

      // Step 1: Send OTP (if not already in OTP step)
      if (!otpStep) {
        setLoading(true);
        try {
          const otpRes = await fetch('/api/auth/otp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: formData.email, purpose: 'signup', turnstileToken: turnstileToken.current }),
          });
          const otpData = await otpRes.json();
          if (!otpRes.ok) throw new Error(otpData.error || 'Failed to send code');
          setOtpStep(true);
          setOtpCountdown(60);
          // Start countdown
          const timer = setInterval(() => {
            setOtpCountdown((c) => { if (c <= 1) { clearInterval(timer); return 0; } return c - 1; });
          }, 1000);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
        return;
      }

      // Step 2: Verify OTP then create account
      setLoading(true);
      try {
        const verifyRes = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email, code: otpCode, purpose: 'signup' }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) { setOtpWrong(true); setOtpCode(''); throw new Error(verifyData.error || 'Verification failed'); }

        // OTP verified — now create the account
        const signupRes = await fetch('/api/user/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formData.name, email: formData.email, password: formData.password, agreeToTerms: formData.agreeToTerms, subscribeNewsletter: formData.subscribeNewsletter, turnstileToken: turnstileToken.current, returnTo: effectiveReturnTo }),
        });
        const signupData = await signupRes.json();
        if (!signupRes.ok) throw new Error(signupData.error || 'Signup failed');

        // Sign-up signs them in (session cookie set by the server). New accounts go through onboarding unless they
        // signed up from a job page; full reload so the header and every component see the new session.
        onClose();
        resetForm();
        window.location.href = signupData.onboardingCompleted ? (effectiveReturnTo || '/') : `/onboarding?returnTo=${encodeURIComponent(effectiveReturnTo || '/')}`;
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // ─── Sign In (no OTP needed) ───
    setLoading(true);
    try {
      const res = await fetch('/api/user/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password, turnstileToken: turnstileToken.current }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes('verify your email')) {
          setShowResendVerification(true);
        }
        throw new Error(data.error || 'Login failed');
      }

      // Check if 2FA is required
      if (data.requires2FA) {
        setRequires2FA(true);
        setChallengeToken(data.challengeToken);
        setTwoFAUserType(data.userType || 'founder');
        setLoading(false);
        return;
      }

      onClose();
      resetForm();
      router.push(effectiveReturnTo || data.home || '/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpSending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, purpose: 'signup' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend');
      setOtpCountdown(60);
      const timer = setInterval(() => {
        setOtpCountdown((c) => { if (c <= 1) { clearInterval(timer); return 0; } return c - 1; });
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerify2FA = async () => {
    setError('');
    setLoading(true);

    try {
      const verifyEndpoint = twoFAUserType === 'webuser' || twoFAUserType === 'organizer'
        ? '/api/user/auth/verify-2fa'
        : '/api/founder/auth/verify-2fa';

      const res = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, token: twoFACode, isBackupCode: useBackupCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '2FA verification failed');

      if (twoFAUserType === 'founder') {
        try {
          await fetch('/api/user/auth/bridge-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
        } catch {
          // Non-critical — founder session still works
        }
      }

      onClose();
      resetForm();
      router.push(effectiveReturnTo || (twoFAUserType === 'founder' ? '/founder/dashboard' : '/'));
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    setResendSuccess(false);
    try {
      const res = await fetch('/api/founder/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      if (res.ok) {
        setResendSuccess(true);
        setError('');
        setShowResendVerification(false);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resend verification email');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResendingVerification(false);
    }
  };

  const handleGoogleSignIn = () => {
    const returnUrl = effectiveReturnTo || '/onboarding';
    window.location.href = `/api/user/auth/google?returnTo=${encodeURIComponent(returnUrl)}`;
  };

  const handleForgotPassword = () => {
    onClose();
    router.push('/auth/forgot-password');
  };

  const wrapperClass = fullPage
    ? "fixed inset-0 z-modal flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 p-4"
    : "fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm";

  const cardClass = embedded
    ? "w-full"
    : "bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800";

  // One look for every control: 44px high, 8px corners, 1px borders, 16px text on phones (no zoom on focus).
  const field = CONTROL_FIELD;
  const fieldLabel = CONTROL_LABEL;
  const outlineBtn = `${CONTROL_OUTLINE} gap-2.5`;
  const primaryBtn = CONTROL_PRIMARY;
  const textLink = CONTROL_LINK;
  const signupCodeStep = mode === 'signup' && otpStep;

  const cardContent = (
      <div className={cardClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-start justify-between ${embedded ? 'pb-4' : 'px-6 pt-6 pb-1'}`}>
          <div>
            <h2 className="font-sora text-xl font-bold text-gray-900 dark:text-white">
              {requires2FA ? 'Two-step verification' : mode === 'signin' ? 'Sign in' : signupCodeStep ? 'Check your email' : 'Create your account'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {requires2FA
                ? 'One more step to keep your account safe.'
                : mode === 'signin'
                  ? 'Welcome back to Udyaibase.'
                  : signupCodeStep ? 'It can take a minute to arrive.' : 'Free, and takes under a minute.'}
            </p>
          </div>
          {!fullPage && !embedded && (
            <button
              onClick={() => { onClose(); resetForm(); }}
              className="-mr-2 -mt-1 w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* 2FA Verification */}
        {requires2FA ? (
          <div className="px-6 pt-4 pb-6 space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {useBackupCode ? 'Enter one of your backup codes' : 'Enter the 6-digit code from your authenticator app'}
            </p>

            {useBackupCode ? (
              <input type="text" value={twoFACode} autoFocus maxLength={8} placeholder="XXXXXXXX" aria-label="Backup code"
                onChange={(e) => setTwoFACode(e.target.value.toUpperCase())}
                className={`${field} text-center font-mono tracking-widest`} />
            ) : (
              <CodeInput autoFocus value={twoFACode} onChange={setTwoFACode} label="Authenticator code" />
            )}

            <button onClick={handleVerify2FA} disabled={loading || (useBackupCode ? twoFACode.length !== 8 : twoFACode.length !== 6)} className={primaryBtn}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify'}
            </button>

            <div className="flex justify-center gap-2">
              <button type="button" onClick={() => { setUseBackupCode(!useBackupCode); setTwoFACode(''); setError(''); }} className={textLink}>
                {useBackupCode ? 'Use authenticator code' : 'Use a backup code'}
              </button>
              <button type="button" onClick={() => { setRequires2FA(false); setTwoFACode(''); setChallengeToken(''); setTwoFAUserType('founder'); setError(''); }} className={textLink}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="px-6 pt-5 pb-6">
              {!signupCodeStep && (<>
              {/* Google OAuth */}
              <button
                onClick={handleGoogleSignIn}
                className={outlineBtn}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              {/* The two quick ways in sit together; the password form follows for people who use one. */}
              {mode === 'signin' && !codeSignIn && (
                <button
                  type="button"
                  onClick={() => { setError(''); setCodeSignIn(true); }}
                  className={`${outlineBtn} mt-2.5`}
                >
                  <Mail className="w-5 h-5" aria-hidden />
                  Email me a sign-in code
                </button>
              )}

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white dark:bg-gray-900 text-gray-400">
                    {mode === 'signin' ? (codeSignIn ? 'or with a code' : 'or with your password') : 'or with your email'}
                  </span>
                </div>
              </div>
              </>)}

              {mode === 'signin' && codeSignIn ? (
                // No password needed: accounts made with an emailed code (e.g. from a job page) sign in the same way.
                <CandidateSignIn compact startWithEmail returnTo={effectiveReturnTo || '/'} initialEmail={formData.email} onBack={() => setCodeSignIn(false)} />
              ) : (
              <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {resendSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3 text-sm text-green-600 dark:text-green-400">
                    Verification email sent! Please check your inbox.
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    {showResendVerification && (
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendingVerification}
                        className="mt-2 text-sm text-brand hover:underline font-medium disabled:opacity-50 flex items-center gap-2"
                      >
                        {resendingVerification ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending...</> : 'Resend Verification Email'}
                      </button>
                    )}
                  </div>
                )}

                {!signupCodeStep && (<>
                {/* Name - signup only */}
                {mode === 'signup' && (
                  <div>
                    <label htmlFor="modal-name" className={fieldLabel}>Full name</label>
                    <input id="modal-name" type="text" required autoComplete="name" value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={field} placeholder="Your name" />
                  </div>
                )}

                {/* Email */}
                <div>
                  <label htmlFor="modal-email" className={fieldLabel}>Email</label>
                  <input id="modal-email" type="email" required autoComplete="email" value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={field} placeholder="you@example.com" />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="modal-password" className="text-sm font-medium text-gray-800 dark:text-gray-200">Password</label>
                    {mode === 'signin' && (
                      <button type="button" onClick={handleForgotPassword} className="-my-2 py-2 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:underline">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <PasswordField
                    id="modal-password"
                    label="Password"
                    hideLabel
                    required
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={formData.password}
                    onChange={(v) => setFormData({ ...formData, password: v })}
                    email={formData.email}
                    personName={formData.name}
                    // Guidance shows only while the password still misses a rule; once it passes, the field goes quiet.
                    showRules={mode === 'signup' && formData.password.length > 0 && !!passwordProblem(formData.password, formData.email, 'mixed', formData.name)}
                    
                  />
                </div>

                {/* Terms - signup only */}
                {mode === 'signup' && (
                  <div className="flex items-start gap-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      id="modal-terms"
                      checked={formData.agreeToTerms}
                      onChange={(e) => {
                        e.stopPropagation();
                        setFormData(prev => ({ ...prev, agreeToTerms: e.target.checked }));
                        if (e.target.checked) setTermsError(false);
                      }}
                      aria-invalid={termsError || undefined}
                      aria-describedby={termsError ? 'modal-terms-error' : undefined}
                      className={`mt-0.5 w-4 h-4 rounded border-gray-300 accent-gray-900 dark:accent-white shrink-0 cursor-pointer ${termsError ? 'outline outline-2 outline-offset-2 outline-red-500' : ''}`}
                    />
                    <label htmlFor="modal-terms" className="text-[13px] text-gray-600 dark:text-gray-400 leading-snug cursor-pointer select-none">
                      {termsError && <span id="modal-terms-error" role="alert" className="block font-medium text-red-700 dark:text-red-400">Tick this to create your account.</span>}
                      I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 dark:text-white underline" onClick={(e) => e.stopPropagation()}>Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 dark:text-white underline" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>
                    </label>
                  </div>
                )}

                {/* Newsletter consent - signup only */}
                {mode === 'signup' && (
                  <div className="flex items-start gap-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      id="modal-newsletter"
                      checked={formData.subscribeNewsletter}
                      onChange={(e) => {
                        e.stopPropagation();
                        setFormData(prev => ({ ...prev, subscribeNewsletter: e.target.checked }));
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-gray-900 dark:accent-white shrink-0 cursor-pointer"
                    />
                    <label htmlFor="modal-newsletter" className="text-[13px] text-gray-600 dark:text-gray-400 leading-snug cursor-pointer select-none">
                      Send me the weekly AI newsletter <span className="text-gray-400">(optional)</span>
                    </label>
                  </div>
                )}
                </>)}

                {/* Sign-up step 2: the code, centered, on its own screen. */}
                {signupCodeStep && (
                  <div className="text-center">
                    <label htmlFor="modal-signup-code" className="block text-sm text-gray-600 dark:text-gray-400">
                      Enter the code we sent to <span className="block font-medium text-gray-900 dark:text-white truncate">{formData.email}</span>
                    </label>
                    <div className="mt-4">
                      <CodeInput id="modal-signup-code" autoFocus value={otpCode} invalid={otpWrong}
                        onChange={(v) => { setOtpCode(v); if (otpWrong) setOtpWrong(false); }} />
                    </div>
                  </div>
                )}

                {!otpStep && (
                  <TurnstileWidget
                    onSuccess={(token) => { turnstileToken.current = token; }}
                    onExpire={() => { turnstileToken.current = ''; }}
                  />
                )}

                {/* Submit */}
                <button
                  ref={submitRef}
                  type="submit"
                  disabled={loading || (signupCodeStep && otpCode.length !== 6)}
                  className={primaryBtn}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {mode === 'signin' ? 'Signing in…' : otpStep ? 'Creating your account…' : 'Sending code…'}</>
                  ) : (
                    mode === 'signin' ? 'Sign in' : otpStep ? 'Create account' : 'Continue'
                  )}
                </button>

                {signupCodeStep && (
                  <div className="flex justify-center gap-2 -mt-1">
                    <button type="button" onClick={handleResendOtp} disabled={otpCountdown > 0 || otpSending} className={textLink}>
                      {otpSending ? 'Sending…' : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend code'}
                    </button>
                    <button type="button" onClick={() => { setOtpStep(false); setOtpCode(''); setError(''); }} className={textLink}>
                      Change email
                    </button>
                  </div>
                )}
              </form>
              </>
              )}

              {/* Toggle mode */}
              {!signupCodeStep && <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                {mode === 'signin' ? (
                  <>
                    Don&apos;t have an account?{' '}
                    <button onClick={() => { setMode('signup'); resetForm(); }} className="inline-flex items-center min-h-[44px] px-1 font-semibold text-gray-900 dark:text-white hover:underline">
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button onClick={() => { setMode('signin'); resetForm(); }} className="inline-flex items-center min-h-[44px] px-1 font-semibold text-gray-900 dark:text-white hover:underline">
                      Sign in
                    </button>
                  </>
                )}
              </div>}
            </div>
          </>
        )}
      </div>
  );

  if (embedded) return cardContent;

  return (
    <div className={wrapperClass}>
      {cardContent}
    </div>
  );
}
