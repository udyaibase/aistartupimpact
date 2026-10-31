'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, Building2, Mail, Lock, Globe, ArrowRight, Eye, EyeOff, ShieldCheck, Users, BarChart3, Zap, UserPlus } from 'lucide-react';
import TurnstileWidget from '@/components/shared/TurnstileWidget';

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

export default function EmployerSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'verify'>('form');

  // If already logged in, redirect to dashboard
  useEffect(() => {
    fetch('/api/employer/session').then(r => r.json()).then(data => {
      if (data.authenticated) router.replace('/employer/onboarding');
    }).catch(() => {});
  }, [router]);

  const [formData, setFormData] = useState({
    companyName: '', email: '', password: '', websiteUrl: '', industry: '', companySize: '',
  });
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const turnstileToken = useRef('');

  // Password strength
  const getPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };
  const strength = getPasswordStrength(formData.password);
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][strength] || '';
  const strengthColor = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-emerald-500'][strength] || '';

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/employer/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, turnstileToken: turnstileToken.current }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Signup failed'); return; }

      // Send OTP. The account exists now, so go to the verify step either way; resend is available there.
      const otpRes = await fetch('/api/employer/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      const otpData = await otpRes.json().catch(() => ({}));
      if (!otpRes.ok) {
        setError(otpData.error || "We couldn't send the verification email. Use “Resend code” to try again.");
      }
      setResendIn(otpData.cooldown ?? otpData.retryAfter ?? 60);

      setStep('verify');
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/employer/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Verification failed'); return; }

      router.push('/employer/onboarding');
      router.refresh();
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  const resendOtp = async () => {
    setError('');
    try {
      const res = await fetch('/api/employer/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      const data = await res.json().catch(() => ({}));
      setError(res.ok ? 'New code sent to your email' : data.error || "We couldn't send a new code. Please try again.");
      setResendIn(data.cooldown ?? data.retryAfter ?? (res.ok ? 60 : 0));
    } catch {
      setError("You seem to be offline. Check your connection and try again.");
    }
  };

  // OTP Verification Step — stays a centered card (transitional step)
  if (step === 'verify') {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="font-sora font-extrabold text-2xl text-gray-900 dark:text-white">Verify Your Email</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-2">
              We sent a 6-digit code to <strong>{formData.email}</strong>
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-xl shadow-gray-200/50 dark:shadow-black/30 p-6 sm:p-8">
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {error && (
                <div className={`rounded-lg p-3 text-sm ${error.includes('sent') ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'} border ${error.includes('sent') ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}`}>
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  aria-label="Verification code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  autoFocus
                />
              </div>

              <button type="submit" disabled={loading || otpCode.length !== 6} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold font-jakarta text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </form>

            <div className="text-center mt-4">
              <button onClick={resendOtp} disabled={resendIn > 0} className="min-h-[44px] px-3 text-sm text-blue-600 font-semibold font-jakarta hover:underline disabled:text-gray-400 disabled:no-underline">
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Didn't receive the code? Resend"}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500 font-jakarta mt-4">Code expires in 10 minutes. Max 3 attempts. Check your spam folder if it doesn&apos;t arrive. You can also verify later from your dashboard.</p>
        </div>
      </div>
    );
  }

  // Signup Form — split layout
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
                <Briefcase className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
              </div>
              <span className="font-sora font-bold text-white text-xs lg:text-sm tracking-wide uppercase">Employer Portal</span>
            </div>

            <h2 className="font-sora font-extrabold text-xl lg:text-3xl text-white leading-tight mb-2 lg:mb-3">
              Hire AI Talent Faster
            </h2>
            <p className="text-white/80 text-xs lg:text-sm font-jakarta leading-relaxed mb-4 lg:mb-8 max-w-sm">
              Post AI jobs and reach 45K+ professionals — backed by India&apos;s largest AI community.
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
                Create your account
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">
                Get started in under 2 minutes
              </p>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Anthropic"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Work Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="hiring@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Min 8 chars, uppercase + number"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Password strength bar */}
                {formData.password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength ? strengthColor : 'bg-gray-200 dark:bg-gray-700'}`} />
                      ))}
                    </div>
                    <p className={`text-xs font-jakarta ${strength >= 4 ? 'text-green-600' : strength >= 3 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {strengthLabel}
                      {strength < 3 && ' — needs uppercase, lowercase & number'}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={formData.websiteUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, websiteUrl: e.target.value }))}
                    placeholder="https://company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Industry</label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  >
                    <option value="">Select</option>
                    <option value="AI Infrastructure & MLOps">AI Infrastructure</option>
                    <option value="Enterprise Software & SaaS">Enterprise SaaS</option>
                    <option value="Developer Tools & DevOps">Developer Tools</option>
                    <option value="FinTech">FinTech</option>
                    <option value="HealthTech & BioTech">HealthTech</option>
                    <option value="EdTech">EdTech</option>
                    <option value="Cybersecurity">Cybersecurity</option>
                    <option value="Data & Analytics">Data & Analytics</option>
                    <option value="Robotics & Industrial Automation">Robotics</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Company Size</label>
                  <select
                    value={formData.companySize}
                    onChange={(e) => setFormData(prev => ({ ...prev, companySize: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  >
                    <option value="">Select</option>
                    <option value="1-10">1-10</option>
                    <option value="11-50">11-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201-500">201-500</option>
                    <option value="500+">500+</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                  <span className="text-red-500 text-sm">⚠</span>
                  <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{error}</p>
                </div>
              )}

              <p className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta leading-relaxed">
                By creating an account, you agree to our{' '}
                <Link href="/terms" className="underline hover:text-gray-600 dark:hover:text-gray-300">Terms of Service</Link> and{' '}
                <Link href="/privacy" className="underline hover:text-gray-600 dark:hover:text-gray-300">Privacy Policy</Link>.
              </p>

              <TurnstileWidget
                onSuccess={(token) => { turnstileToken.current = token; }}
                onExpire={() => { turnstileToken.current = ''; }}
              />

              <button
                type="submit"
                disabled={loading || strength < 3}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold font-jakarta text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? 'Creating account...' : 'Create Account'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-5">
              Already have an account?{' '}
              <Link href="/employer/login" className="text-blue-600 font-semibold hover:underline">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
