"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CalendarDays, Mail, Lock, User, Building2, CheckCircle, ArrowLeft, Shield, Users, BarChart3, Ticket, UserPlus, Globe, Zap } from "lucide-react";
import TurnstileWidget from "@/components/shared/TurnstileWidget";

type Mode = "login" | "signup" | "forgot";

const benefits = [
  {
    icon: CalendarDays,
    title: "Event Dashboard",
    desc: "Real-time RSVPs, check-ins & analytics at your fingertips",
  },
  {
    icon: Ticket,
    title: "Tickets & Registration",
    desc: "Free & paid tickets with QR code check-in",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    desc: "Invite staff & assign roles for seamless event management",
  },
  {
    icon: BarChart3,
    title: "Analytics & Insights",
    desc: "Track attendance, engagement & revenue in real time",
  },
  {
    icon: Globe,
    title: "Community Reach",
    desc: "Tap into India's largest AI community of 10,000+ members",
  },
  {
    icon: Zap,
    title: "Instant Publishing",
    desc: "Go live in minutes with built-in event pages & SEO",
  },
];

function OrganizerAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get("mode") === "signup" ? "signup" : "login") as Mode;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");

  const [requires2FA, setRequires2FA] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const turnstileToken = useRef('');

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError === "oauth_failed") setError("Google sign-in failed. Please try again.");
    if (urlError === "suspended") setError("Your account has been suspended. Contact support.");
    if (urlError === "no_code") setError("Google sign-in was cancelled.");
    if (urlError === "invalid_token") setError("Invalid or expired verification link.");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!turnstileToken.current) {
      setError("Please complete the CAPTCHA verification before continuing.");
      return;
    }

    setLoading(true);

    if (mode === "forgot") {
      try {
        const res = await fetch("/api/organizer/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, turnstileToken: turnstileToken.current }),
        });
        const data = await res.json();
        setSuccessMsg(data.message || "If an account exists, we've sent a reset link.");
      } catch {
        setSuccessMsg("If an account exists, we've sent a reset link.");
      }
      setLoading(false);
      return;
    }

    const endpoint = mode === "signup" ? "/api/organizer/auth/signup" : "/api/organizer/auth/login";
    const body = mode === "signup" ? { name, email, password, company, turnstileToken: turnstileToken.current } : { email, password, turnstileToken: turnstileToken.current };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.requires2FA) {
        setRequires2FA(true);
        setChallengeToken(data.challengeToken);
        setLoading(false);
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      if (mode === "signup" && data.message) {
        setSuccessMsg(data.message);
      }

      router.push("/organizer");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    window.location.href = "/api/organizer/auth/google";
  };

  const handleVerify2FA = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/organizer/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, token: twoFACode, isBackupCode: useBackupCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || "2FA verification failed"); return; }
      router.push("/organizer");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError("");
    setSuccessMsg("");
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-0 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-xl shadow-gray-200/50 dark:shadow-black/30">

        {/* Left — Benefits panel */}
        <div className="relative bg-gradient-to-br from-brand via-red-600 to-red-700 p-5 sm:p-6 lg:p-12 flex flex-col justify-between overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h40v40H0z\' fill=\'none\'/%3E%3Cpath d=\'M20 0v40M0 20h40\' stroke=\'%23fff\' stroke-width=\'.5\'/%3E%3C/svg%3E")', backgroundSize: '40px 40px' }} />

          <div className="relative z-10">
            {/* Compact mobile header */}
            <div className="flex items-center gap-2.5 mb-4 lg:mb-8">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <CalendarDays className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
              </div>
              <span className="font-sora font-bold text-white text-xs lg:text-sm tracking-wide uppercase">Event Organizer Portal</span>
            </div>

            <h2 className="font-sora font-extrabold text-xl lg:text-3xl text-white leading-tight mb-2 lg:mb-3">
              {mode === "signup" ? "Host & Manage AI Events" : "Welcome Back"}
            </h2>
            <p className="text-white/80 text-xs lg:text-sm font-jakarta leading-relaxed mb-4 lg:mb-8 max-w-sm">
              {mode === "signup"
                ? "Built-in registration, ticketing & team tools — backed by India's largest AI community."
                : "Sign in to manage your events & engage with attendees."}
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
                Trusted by <span className="text-white font-semibold">200+</span> event organizers
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
                {mode === "login" && "Sign in to your account"}
                {mode === "signup" && "Create your account"}
                {mode === "forgot" && "Reset your password"}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">
                {mode === "login" && "Enter your credentials to continue"}
                {mode === "signup" && "Get started in under 2 minutes"}
                {mode === "forgot" && "We'll send you a reset link"}
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
                  onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, useBackupCode ? 20 : 6))}
                  placeholder={useBackupCode ? "Backup code" : "000000"}
                  maxLength={useBackupCode ? 20 : 6}
                  className="w-full px-4 py-3 text-center text-xl font-mono tracking-widest border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  autoFocus
                />

                <button
                  onClick={handleVerify2FA}
                  disabled={loading || (!useBackupCode && twoFACode.length !== 6) || (useBackupCode && !twoFACode)}
                  className="w-full py-3 bg-brand hover:bg-red-700 text-white font-bold font-jakarta text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Verifying..." : "Verify"}
                </button>

                <div className="flex items-center justify-between text-xs">
                  <button onClick={() => { setUseBackupCode(!useBackupCode); setTwoFACode(""); }} className="text-brand font-semibold hover:underline">
                    {useBackupCode ? "Use authenticator code" : "Use backup code"}
                  </button>
                  <button onClick={() => { setRequires2FA(false); setTwoFACode(""); setChallengeToken(""); setError(""); }} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    Back to login
                  </button>
                </div>
              </div>
            ) : (
            <>
            {/* Google OAuth */}
            {mode !== "forgot" && (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors font-jakarta text-sm font-semibold text-gray-700 dark:text-gray-200"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white dark:bg-gray-900 px-3 text-xs text-gray-400 dark:text-gray-500 font-jakarta">or continue with email</span>
                  </div>
                </div>
              </>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Organization <span className="text-gray-400 font-normal">(optional)</span></label>
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Your company or org"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                  />
                </div>
              </div>

              {mode !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta">Password</label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="text-xs text-brand font-semibold font-jakarta hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "Min 8 characters" : "Enter your password"}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                  <span className="text-red-500 text-sm">⚠</span>
                  <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{error}</p>
                </div>
              )}

              {successMsg && (
                <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-xl">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-green-700 dark:text-green-400 font-jakarta">{successMsg}</p>
                </div>
              )}

              <TurnstileWidget
                onSuccess={(token) => { turnstileToken.current = token; }}
                onExpire={() => { turnstileToken.current = ''; }}
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-brand hover:bg-red-700 text-white font-bold font-jakarta text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "login" && "Sign In"}
                {mode === "signup" && "Create Account"}
                {mode === "forgot" && "Send Reset Link"}
              </button>
            </form>

            {/* Mode switching */}
            <div className="text-center mt-5 space-y-2">
              {mode === "login" && (
                <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">
                  Don&apos;t have an account?{" "}
                  <button onClick={() => switchMode("signup")} className="text-brand font-semibold hover:underline">
                    Sign up free
                  </button>
                </p>
              )}
              {mode === "signup" && (
                <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">
                  Already have an account?{" "}
                  <button onClick={() => switchMode("login")} className="text-brand font-semibold hover:underline">
                    Sign in
                  </button>
                </p>
              )}
              {mode === "forgot" && (
                <button
                  onClick={() => switchMode("login")}
                  className="inline-flex items-center gap-1 text-sm text-brand font-semibold font-jakarta hover:underline"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              )}
            </div>

            {mode === "signup" && (
              <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 font-jakarta mt-4 leading-relaxed">
                By creating an account, you agree to our{" "}
                <Link href="/terms" className="underline hover:text-gray-600 dark:hover:text-gray-300">Terms of Service</Link> and{" "}
                <Link href="/privacy" className="underline hover:text-gray-600 dark:hover:text-gray-300">Privacy Policy</Link>.
              </p>
            )}
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrganizerAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-64px)] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" /></div>}>
      <OrganizerAuthContent />
    </Suspense>
  );
}
