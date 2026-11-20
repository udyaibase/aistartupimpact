"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import PasswordField from "@/components/ui/PasswordField";
import { validatePassword } from "@/lib/password-validation";
import { CONTROL_LINK, CONTROL_PRIMARY } from "@/lib/ui/form-controls";
import { InviteCard, InviteEmail, InviteFooter, InviteHeading, InviteShell, roleLabel } from "@/components/invite/InviteFrame";

function AcceptContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [invite, setInvite] = useState<{ invitedBy: string; startup: string | null; role: string; email: string; expiresAt: string | null; needsPassword: boolean } | null>(null);
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

  // Messages (invalid, declined, done, errors) use the same card as the invitation itself.
  const message = (tone: 'red' | 'green' | 'gray', icon: React.ReactNode, title: string, body: React.ReactNode, action?: React.ReactNode) => {
    const ring = { red: 'bg-red-50 text-red-600 dark:bg-red-900/20', green: 'bg-green-50 text-green-600 dark:bg-green-900/20', gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800' }[tone];
    return (
      <InviteShell><InviteCard>
        <div className="text-center">
          <div className={`mx-auto mb-4 w-10 h-10 rounded-full flex items-center justify-center ${ring}`}>{icon}</div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{body}</div>
          {action && <div className="mt-6">{action}</div>}
        </div>
      </InviteCard></InviteShell>
    );
  };

  if (!token) return message('red', <AlertTriangle className="w-5 h-5" aria-hidden />, 'This invite link is incomplete', 'Open the link from the invitation email again, or ask for a new invite.');

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

  if (declined) return message('gray', <CheckCircle2 className="w-5 h-5" aria-hidden />, 'Invitation declined', 'We’ve let them know. You can close this page.');
  if (inviteError) return message('red', <AlertTriangle className="w-5 h-5" aria-hidden />, 'This invitation isn’t valid', inviteError,
    <a href="/auth/login" className={CONTROL_PRIMARY}>Go to sign in</a>);
  if (!invite && !done) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading" /></div>;
  if (done) return message('green', <CheckCircle2 className="w-5 h-5" aria-hidden />, `You’re in, welcome to ${invite?.startup ?? 'the team'}!`,
    invite?.needsPassword ? <>Your account is ready. Sign in with <strong>{invite.email}</strong> and the password you just set.</> : <>Sign in with your existing account for <strong>{invite?.email}</strong>.</>,
    <a href="/auth/login" className={CONTROL_PRIMARY}>Continue to sign in <ArrowRight className="w-4 h-4" aria-hidden /></a>);

  const inv = invite!;
  return (
    <InviteShell>
      <InviteCard>
        <InviteHeading team={inv.startup ?? 'the team'} inviter={inv.invitedBy} role={roleLabel(inv.role)} detail="Help manage the startup on Udyaibase." />

        <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
          <InviteEmail email={inv.email} />
          {inv.needsPassword ? (
            <PasswordField
              label="Password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(v) => { setPassword(v); if (error) setError(""); }}
              email={inv.email}
              policy="strict"
              showRules={password.length > 0}
              hint={password.length === 0 ? "At least 8 characters, with upper and lower case letters, a number and a symbol." : undefined}
            />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">You already have an account with this email. Accept, then sign in as usual.</p>
          )}

          {error && (
            <div role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
              {serverErrors.length > 1 && <ul className="mt-1 space-y-0.5">{serverErrors.slice(1).map((e, i) => <li key={i} className="text-xs">• {e}</li>)}</ul>}
            </div>
          )}

          <div className="pt-2">
            <button type="submit" disabled={loading || (inv.needsPassword ? (validation ? !validation.valid : true) : false)} className={CONTROL_PRIMARY}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {loading ? 'Joining…' : inv.needsPassword ? 'Create account and join' : 'Accept invitation'}
            </button>
            <div className="mt-1 text-center">
              <button type="button" onClick={handleDecline} disabled={loading} className={CONTROL_LINK}>Decline invitation</button>
            </div>
          </div>
        </form>
      </InviteCard>
      <InviteFooter expiresAt={inv.expiresAt} />
    </InviteShell>
  );
}

export default function FounderTeamAcceptPage() {
  return <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading" /></div>}><AcceptContent /></Suspense>;
}
