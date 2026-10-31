'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, Mail, Lock, ArrowRight, Eye, EyeOff, Shield, Users, BarChart3, Building2, Globe, Zap, UserPlus } from 'lucide-react';
import TurnstileWidget from '@/components/shared/TurnstileWidget';
import TeamCodeSignIn from '@/components/employer/team/TeamCodeSignIn';

const benefits = [
  {
    icon: Briefcase,
    title: 'AI Job Listings',
    desc: 'Post jobs to reach 45K+ AI professionals',
  },
  {
    icon: Users,
    title: 'Talent Pipeline',
    desc: 'Access pre-screened candidates with AI skills',
  },
  {
    icon: BarChart3,
    title: 'Hiring Analytics',
    desc: 'Track applications, views & conversion rates',
  },
  {
    icon: Building2,
    title: 'Company Profile',
    desc: 'Showcase your company to the AI community',
  },
  {
    icon: Globe,
    title: 'Industry Reach',
    desc: "Connect with India's fastest-growing AI talent pool",
  },
  {
    icon: Zap,
    title: 'Quick Setup',
    desc: 'Post your first job in under 5 minutes',
  },
];

export default function EmployerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const turnstileToken = useRef('');

  // If already logged in, redirect to dashboard
  useEffect(() => {
    fetch('/api/employer/session').then(r => r.json()).then(data => {
      if (data.authenticated) router.replace('/employer/dashboard');
    }).catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/employer/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstileToken: turnstileToken.current }),
      });

      const data = await res.json();

      if (!res.ok && !data.requires2FA) {
        setError(data.error || 'Login failed');
        return;
      }

      if (data.requires2FA) {
        setRequires2FA(true);
        setChallengeToken(data.challengeToken);
        setLoading(false);
        return;
      }

      router.push(data.onboardingCompleted === false ? '/employer/onboarding' : '/employer/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/employer/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, token: twoFACode, isBackupCode: useBackupCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '2FA verification failed'); return; }
      router.push('/employer/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-0 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-xl shadow-gray-200/50 dark:shadow-black/30">

        {/* Left — Benefits panel */}
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-5 sm:p-6 lg:p-12 flex flex-col justify-between overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h40v40H0z\' fill=\'none\'/%3E%3Cpath d=\'M20 0v40M0 20h40\' stroke=\'%23fff\' stroke-width=\'.5\'/%3E%3C/svg%3E")', backgroundSize: '40px 40px' }} />

          <div className="relative z-10">
            {/* Compact mobile header */}
            <div className="flex items-center gap-2.5 mb-4 lg:mb-8">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                {requires2FA ? <Shield className="w-4 h-4 lg:w-5 lg:h-5 text-white" /> : <Briefcase className="w-4 h-4 lg:w-5 lg:h-5 text-white" />}
              </div>
              <span className="font-sora font-bold text-white text-xs lg:text-sm tracking-wide uppercase">Employer Portal</span>
            </div>

            <h2 className="font-sora font-extrabold text-xl lg:text-3xl text-white leading-tight mb-2 lg:mb-3">
              {requires2FA ? 'Two-Factor Authentication' : 'Welcome Back'}
            </h2>
            <p className="text-white/80 text-xs lg:text-sm font-jakarta leading-relaxed mb-4 lg:mb-8 max-w-sm">
              {requires2FA
                ? 'Enter the 6-digit code from your authenticator app to continue.'
                : 'Sign in to manage your AI job listings & hiring pipeline.'}
            </p>

            {/* Mobile: 3 compact chips in a row */}
            <div className="flex flex-wrap gap-2 lg:hidden">
              {benefits.slice(0, 3).map((b) => (
                <div key={b.title} className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5">
                  <b.icon className="w-3.5 h-3.5 text-white" />
                  <span className="text-white text-xs font-semibold font-jakarta">{b.title}</span>
                </div>
              ))}
            </div>

            {/* Desktop: full benefit cards grid */}
            <div className="hidden lg:grid grid-cols-2 gap-4">
              {benefits.map((b) => (
                <div key={b.title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 mt-0.5">
                    <b.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm font-jakarta">{b.title}</p>
                    <p className="text-white/65 text-xs font-jakarta leading-snug mt-0.5">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Social proof — compact on mobile */}
          <div className="relative z-10 mt-4 lg:mt-8 pt-4 lg:pt-6 border-t border-white/15">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1.5 lg:-space-x-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
                    <UserPlus className="w-2.5 h-2.5 lg:w-3 lg:h-3 text-white/80" />
                  </div>
                ))}
              </div>
              <p className="text-white/75 text-[11px] lg:text-xs font-jakarta">
                Trusted by <span className="text-white font-semibold">500+</span> companies hiring AI talent
              </p>
            </div>
          </div>
        </div>

        {/* Right — Form panel */}
        <div className="p-5 sm:p-8 lg:p-12 flex flex-col justify-center">
          <div className="w-full max-w-sm mx-auto">
            {/* Form header */}
            <div className="mb-5 lg:mb-6">
              <h1 className="font-sora font-extrabold text-lg sm:text-xl lg:text-2xl text-gray-900 dark:text-white">
                {requires2FA ? 'Verify your identity' : 'Sign in to your account'}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">
                {requires2FA ? 'Two-factor authentication required' : 'Enter your credentials to continue'}
              </p>
            </div>

            {/* 2FA Verification */}
            {requires2FA ? (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <div className="w-12 h-12 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                    <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="font-sora font-bold text-lg text-gray-900 dark:text-white">Two-Factor Authentication</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter the 6-digit code from your authenticator app</p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                    <span className="text-red-500 text-sm">⚠</span>
                    <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{error}</p>
                  </div>
                )}

                <input
                  type="text"
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, useBackupCode ? 20 : 6))}
                  placeholder={useBackupCode ? 'Backup code' : '000000'}
                  maxLength={useBackupCode ? 20 : 6}
                  className="w-full px-4 py-3 text-center text-xl font-mono tracking-widest border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  autoFocus
                />

                <button
                  onClick={handleVerify2FA}
                  disabled={loading || (!useBackupCode && twoFACode.length !== 6) || (useBackupCode && !twoFACode)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold font-jakarta text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <ArrowRight className="w-4 h-4 animate-pulse" />}
                  {loading ? 'Verifying...' : 'Verify'}
                </button>

                <div className="flex items-center justify-between text-xs">
                  <button onClick={() => { setUseBackupCode(!useBackupCode); setTwoFACode(''); }} className="text-blue-600 font-semibold hover:underline">
                    {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
                  </button>
                  <button onClick={() => { setRequires2FA(false); setTwoFACode(''); setChallengeToken(''); setError(''); }} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    Back to login
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="company@example.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta">Password</label>
                      <Link href="/employer/forgot-password" className="text-xs text-blue-600 font-semibold font-jakarta hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                      <span className="text-red-500 text-sm">⚠</span>
                      <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{error}</p>
                    </div>
                  )}

                  <TurnstileWidget
                    onSuccess={(token) => { turnstileToken.current = token; }}
                    onExpire={() => { turnstileToken.current = ''; }}
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold font-jakarta text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-5" aria-hidden>
                  <span className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                  <span className="text-xs text-gray-400 font-jakarta">or</span>
                  <span className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                </div>
                <a
                  href="/api/employer/auth/founder"
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Continue with your founder account
                </a>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-2">
                  Founders with a verified startup can hire without a separate login.
                </p>
                <TeamCodeSignIn />

                <p className="text-center text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-5">
                  Don&apos;t have an account?{' '}
                  <Link href="/employer/signup" className="text-blue-600 font-semibold hover:underline">Create Employer Account</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
