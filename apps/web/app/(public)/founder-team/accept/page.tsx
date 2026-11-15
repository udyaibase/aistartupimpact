"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock, CheckCircle, ShieldCheck } from "lucide-react";
import PasswordField from "@/components/ui/PasswordField";
import { validatePassword } from "@/lib/password-validation";

function AcceptContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [invite, setInvite] = useState<{ invitedBy: string; startup: string | null; role: string; needsPassword: boolean } | null>(null);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/founder/team/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setInvite(d); else setInviteError(d.error || "This invite is no longer valid."); })
      .catch(() => setInviteError("Couldn’t load this invite. Please try again."));
  }, [token]);

  const validation = useMemo(() => {
    if (!password) return null;
    return validatePassword(password);
  }, [password]);

  if (!token) return <div className="max-w-md mx-auto py-20 text-center"><p className="text-gray-500 font-jakarta">Invalid invite link.</p></div>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setServerErrors([]);

    if (invite?.needsPassword) {
      if (validation && !validation.valid) { setError(validation.errors[0]); return; }
    }

    setLoading(true);
    const res = await fetch("/api/founder/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const d = await res.json();
    if (d.success) {
      setDone(true);
    } else {
      setError(d.error || "Failed");
      if (d.errors) setServerErrors(d.errors);
    }
    setLoading(false);
  };

  const handleDecline = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/founder/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "decline" }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (d?.success) setDeclined(true);
    else setError(d?.error || "Couldn’t decline. Please try again.");
    setLoading(false);
  };

  if (declined) return (
    <div className="max-w-md mx-auto py-20 text-center space-y-2 px-4">
      <h1 className="font-sora font-bold text-xl text-navy dark:text-white">Invite declined</h1>
      <p className="text-sm text-gray-500 font-jakarta">We’ve let them know. You can close this page.</p>
    </div>
  );

  if (inviteError) return (
    <div className="max-w-md mx-auto py-20 text-center space-y-2 px-4">
      <h1 className="font-sora font-bold text-xl text-navy dark:text-white">Invite not available</h1>
      <p className="text-sm text-gray-500 font-jakarta">{inviteError}</p>
    </div>
  );

  if (!invite && !done) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand" aria-hidden /></div>;

  if (done) return (
    <div className="max-w-md mx-auto py-20 text-center space-y-4">
      <CheckCircle className="w-12 h-12 text-green-600 mx-auto"/>
      <h1 className="font-sora font-bold text-xl text-navy dark:text-white">Welcome to the team!</h1>
      <p className="text-sm text-gray-500 font-jakarta">Your account is ready. You can now log in.</p>
      <a href="/auth/login" className="inline-block px-5 py-2.5 bg-brand text-white font-bold text-sm rounded-lg font-jakarta">Go to Login</a>
    </div>
  );

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="text-center mb-8">
        <div className="w-12 h-12 mx-auto bg-brand/10 rounded-xl flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6 text-brand"/>
        </div>
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white">Accept Invitation</h1>
        <p className="text-sm text-gray-500 font-jakarta mt-1">{invite?.invitedBy} invited you to help manage {invite?.startup ?? "their startup"} as {invite?.role.toLowerCase()}.{invite?.needsPassword ? " Set a strong password to join." : " Accept, then sign in with your existing account."}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {invite?.needsPassword && (<>
        <PasswordField
          label="Create a password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(v) => { setPassword(v); if (error) setError(""); }}
          policy="strict"
          showRules={password.length > 0}
          hint={password.length === 0 ? "At least 8 characters, with upper and lower case letters, a number and a symbol." : undefined}
        />
        </>)}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{error}</p>
            {serverErrors.length > 1 && (
              <ul className="mt-1 space-y-0.5">
                {serverErrors.slice(1).map((e, i) => (
                  <li key={i} className="text-xs text-red-500 font-jakarta">• {e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (invite?.needsPassword ? (validation ? !validation.valid : true) : false)}
          className="w-full py-3 bg-brand hover:bg-brand-600 text-white font-bold text-sm rounded-xl font-jakarta disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin"/>}
          <Lock className="w-4 h-4" aria-hidden />
          {invite?.needsPassword ? "Set Password & Join" : "Accept invitation"}
        </button>
        <button type="button" onClick={handleDecline} disabled={loading} className="w-full py-3 min-h-[44px] text-sm font-semibold text-gray-600 dark:text-gray-400 hover:underline font-jakarta">
          Decline invitation
        </button>
      </form>
    </div>
  );
}

export default function FounderTeamAcceptPage() {
  return <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand"/></div>}><AcceptContent /></Suspense>;
}
