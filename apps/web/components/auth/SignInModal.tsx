'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import TurnstileWidget from '@/components/shared/TurnstileWidget';

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
  const effectiveReturnTo = returnTo || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : null);
  const [mode, setMode] = useState<ModeType>(defaultMode);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: '',
    agreeToTerms: false,
    subscribeNewsletter: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
  const [otpSending, setOtpSending] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  if (!isOpen) return null;

  const resetForm = () => {
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
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowResendVerification(false);
    setResendSuccess(false);
    setRequires2FA(false);
    setTwoFACode('');
    setChallengeToken('');
    setTwoFAUserType('founder');
    setOtpStep(false);
    setOtpCode('');
  };

  const getPasswordStrength = (password: string) => {
    if (password.length === 0) return { strength: 0, label: '', color: '' };
    if (password.length < 6) return { strength: 1, label: 'Weak', color: 'bg-red-500' };
    if (password.length < 8) return { strength: 2, label: 'Fair', color: 'bg-orange-500' };
    if (password.length < 12) return { strength: 3, label: 'Good', color: 'bg-yellow-500' };
    return { strength: 4, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowResendVerification(false);

    if (mode === 'signup') {
      if (!formData.name || formData.name.length < 2) {
        setError('Name must be at least 2 characters');
        return;
      }
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (!formData.agreeToTerms) {
        setError('Please agree to the terms and conditions');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
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
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Verification failed');

        // OTP verified — now create the account
        const signupRes = await fetch('/api/user/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formData.name, email: formData.email, password: formData.password, agreeToTerms: formData.agreeToTerms, subscribeNewsletter: formData.subscribeNewsletter, turnstileToken: turnstileToken.current }),
        });
        const signupData = await signupRes.json();
        if (!signupRes.ok) throw new Error(signupData.error || 'Signup failed');

        // Auto-login after signup
        const loginRes = await fetch('/api/user/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email, password: formData.password }),
        });
        if (!loginRes.ok) throw new Error('Account created! Please sign in.');

        onClose();
        resetForm();
        router.push(effectiveReturnTo || '/onboarding');
        router.refresh();
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
      router.push(effectiveReturnTo || '/onboarding');
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
      router.push(effectiveReturnTo || '/onboarding');
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
    : "bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800";

  const cardContent = (
      <div className={cardClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between ${embedded ? 'pb-4' : 'p-6 border-b border-gray-200 dark:border-gray-800'}`}>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {requires2FA ? 'Verify Identity' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {requires2FA
                ? 'Enter your verification code'
                : mode === 'signin'
                  ? 'Welcome back! Sign in to continue'
                  : 'Join us and start your journey'}
            </p>
          </div>
          {!fullPage && !embedded && (
            <button
              onClick={() => { onClose(); resetForm(); }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* 2FA Verification */}
        {requires2FA ? (
          <div className="p-6 space-y-5">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {useBackupCode
                ? 'Enter one of your backup codes'
                : 'Enter the 6-digit code from your authenticator app'}
            </p>

            <input
              type="text"
              value={twoFACode}
              onChange={(e) => setTwoFACode(useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={useBackupCode ? 'XXXXXXXX' : '000000'}
              maxLength={useBackupCode ? 8 : 6}
              className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              autoFocus
            />

            <button
              type="button"
              onClick={() => { setUseBackupCode(!useBackupCode); setTwoFACode(''); setError(''); }}
              className="text-sm text-brand hover:underline w-full text-center"
            >
              {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
            </button>

            <button
              onClick={handleVerify2FA}
              disabled={loading || (useBackupCode ? twoFACode.length !== 8 : twoFACode.length !== 6)}
              className="w-full bg-brand hover:bg-brand/90 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</> : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setRequires2FA(false); setTwoFACode(''); setChallengeToken(''); setTwoFAUserType('founder'); setError(''); }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Back to login
            </button>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="p-6">
              {/* Google OAuth */}
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors mb-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-semibold text-gray-700 dark:text-gray-300">Continue with Google</span>
              </button>
              {mode === 'signup' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mb-4">
                  By signing up with Google, you agree to our Terms and Privacy Policy.
                </p>
              )}
              {mode === 'signin' && <div className="mb-4" />}

              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white dark:bg-gray-900 text-gray-400">
                    Or {mode === 'signin' ? 'sign in' : 'sign up'} with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {resendSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-600 dark:text-green-400">
                    Verification email sent! Please check your inbox.
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
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

                {/* Name - signup only */}
                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      placeholder="John Doe"
                    />
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    placeholder="your@email.com"
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                    {mode === 'signin' && (
                      <button type="button" onClick={handleForgotPassword} className="text-xs text-brand hover:underline">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white pr-11 text-sm"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mode === 'signup' && formData.password && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full transition-all ${passwordStrength.color}`} style={{ width: `${(passwordStrength.strength / 4) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-500">{passwordStrength.label}</span>
                    </div>
                  )}
                </div>

                {/* Confirm Password - signup only */}
                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white pr-11 text-sm ${
                          formData.confirmPassword && formData.confirmPassword !== formData.password
                            ? 'border-red-300 dark:border-red-700'
                            : 'border-gray-300 dark:border-gray-700'
                        }`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

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
                      }}
                      className="mt-0.5 w-3.5 h-3.5 text-brand border-gray-300 rounded focus:ring-brand shrink-0 cursor-pointer"
                    />
                    <label htmlFor="modal-terms" className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed cursor-pointer select-none">
                      I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline" onClick={(e) => e.stopPropagation()}>Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>
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
                      className="mt-0.5 w-3.5 h-3.5 text-brand border-gray-300 rounded focus:ring-brand shrink-0 cursor-pointer"
                    />
                    <label htmlFor="modal-newsletter" className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed cursor-pointer select-none">
                      Optional: send me the weekly AI newsletter (funding rounds, tool launches, founder stories). Unsubscribe anytime.
                    </label>
                  </div>
                )}

                {/* OTP Input (signup only, after form validation) */}
                {mode === 'signup' && otpStep && (
                  <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Enter the 6-digit code sent to {formData.email}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="w-full px-4 py-3 text-center text-xl font-mono tracking-[0.3em] border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={otpCountdown > 0 || otpSending}
                        className="text-xs text-brand hover:underline disabled:text-gray-400 disabled:no-underline"
                      >
                        {otpSending ? 'Sending...' : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend code'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOtpStep(false); setOtpCode(''); setError(''); }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Change email
                      </button>
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
                  type="submit"
                  disabled={loading || (mode === 'signup' && !formData.agreeToTerms) || (mode === 'signup' && otpStep && otpCode.length !== 6)}
                  className="w-full bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {mode === 'signin' ? 'Signing in...' : otpStep ? 'Verifying...' : 'Sending code...'}</>
                  ) : (
                    mode === 'signin' ? 'Sign In' : otpStep ? 'Verify & Create Account' : 'Continue'
                  )}
                </button>
              </form>

              {/* Toggle mode */}
              <div className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
                {mode === 'signin' ? (
                  <>
                    Don&apos;t have an account?{' '}
                    <button onClick={() => { setMode('signup'); resetForm(); }} className="text-brand hover:underline font-semibold">
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button onClick={() => { setMode('signin'); resetForm(); }} className="text-brand hover:underline font-semibold">
                      Sign in
                    </button>
                  </>
                )}
              </div>
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
