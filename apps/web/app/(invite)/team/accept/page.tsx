"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2 } from "lucide-react";
import PasswordField from "@/components/ui/PasswordField";
import { passwordProblem } from "@/lib/password-rules";

type Invite =
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "expired"; team: string | null }
  | { state: "accepted"; email: string }
  | { state: "pending"; email: string; team: string; inviter: string | null; role: string; roleCan: string; hasAccount: boolean; expiresAt: string }
  | { state: "error" }
  | { state: "limited"; message: string };

const inputCls = "w-full h-11 px-3.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-gray-400";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-[400px]">{children}</div>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-8 sm:px-8">{children}</div>;
}

function StateCard({ icon, tone, title, body, action }: { icon: React.ReactNode; tone: "red" | "amber" | "green"; title: string; body: React.ReactNode; action?: React.ReactNode }) {
  const ring = { red: "bg-red-50 text-red-600 dark:bg-red-900/20", amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/20", green: "bg-green-50 text-green-600 dark:bg-green-900/20" }[tone];
  return (
    <Shell>
      <Card>
        <div className="text-center">
          <div className={`mx-auto mb-4 w-10 h-10 rounded-full flex items-center justify-center ${ring}`}>{icon}</div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{body}</div>
          {action && <div className="mt-6">{action}</div>}
        </div>
      </Card>
    </Shell>
  );
}

const primaryBtn = "w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-medium text-[15px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

function AcceptContent() {
  const token = useSearchParams().get("token");
  const [invite, setInvite] = useState<Invite>({ state: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ email: string; existingAccount: boolean; team: string | null } | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) { setInvite({ state: "invalid" }); return; }
    let live = true;
    fetch(`/api/organizer/team/accept?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 429) return { state: "limited", message: d?.error || "Too many attempts. Please wait a little and try again." } as Invite;
        return d?.state ? (d as Invite) : ({ state: "error" } as Invite);
      })
      .then((d) => { if (live) setInvite(d); })
      .catch(() => { if (live) setInvite({ state: "error" }); });
    return () => { live = false; };
  }, [token]);

  if (invite.state === "loading") {
    return (
      <Shell>
        <Card>
          <div className="animate-pulse space-y-4" aria-label="Loading invitation">
            <div className="h-6 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-11 rounded-lg bg-gray-200 dark:bg-gray-800 mt-8" />
            <div className="h-11 rounded-lg bg-gray-200 dark:bg-gray-800" />
            <div className="h-11 rounded-lg bg-gray-200 dark:bg-gray-800" />
          </div>
        </Card>
      </Shell>
    );
  }

  if (invite.state === "invalid") {
    return <StateCard tone="red" icon={<AlertTriangle className="w-5 h-5" aria-hidden />} title="This invitation link isn’t valid"
      body="It may have been copied incompletely, or the invitation was replaced by a newer one. Open the latest invitation email, or ask the person who invited you to send it again." />;
  }
  if (invite.state === "limited") {
    return <StateCard tone="amber" icon={<Clock className="w-5 h-5" aria-hidden />} title="Please wait a moment"
      body={invite.message} action={<button onClick={() => location.reload()} className={primaryBtn}>Try again</button>} />;
  }
  if (invite.state === "error") {
    return <StateCard tone="amber" icon={<AlertTriangle className="w-5 h-5" aria-hidden />} title="We couldn’t load your invitation"
      body="Check your connection and try again." action={<button onClick={() => location.reload()} className={primaryBtn}>Try again</button>} />;
  }
  if (invite.state === "expired") {
    return <StateCard tone="amber" icon={<Clock className="w-5 h-5" aria-hidden />} title="This invitation has expired"
      body={<>Invitations are valid for 7 days. Ask {invite.team ? <strong>{invite.team}</strong> : "the organizer"} to resend it from their Team page.</>} />;
  }
  if (invite.state === "accepted") {
    return <StateCard tone="green" icon={<CheckCircle2 className="w-5 h-5" aria-hidden />} title="You’ve already joined"
      body={<>This invitation was accepted. Sign in with <strong>{invite.email}</strong> to continue.</>}
      action={<Link href={`/organizer/login?email=${encodeURIComponent(invite.email)}`} className={primaryBtn}>Sign in <ArrowRight className="w-4 h-4" aria-hidden /></Link>} />;
  }

  if (done) {
    return <StateCard tone="green" icon={<CheckCircle2 className="w-5 h-5" aria-hidden />} title={`You’re in${done.team ? `, welcome to ${done.team}` : ""}!`}
      body={done.existingAccount
        ? <>Sign in with your existing password for <strong>{done.email}</strong>. You’ll find the team’s events in your dashboard.</>
        : <>Your account is ready. Sign in with <strong>{done.email}</strong> and the password you just set.</>}
      action={<Link href={`/organizer/login?email=${encodeURIComponent(done.email)}`} className={primaryBtn}>Continue to sign in <ArrowRight className="w-4 h-4" aria-hidden /></Link>} />;
  }

  const inv = invite;
  const expires = new Date(inv.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!inv.hasAccount) {
      const problem = passwordProblem(password, inv.email, 'mixed', name);
      setPwError(problem);
      if (problem) { pwRef.current?.focus(); return; }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/organizer/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...(inv.hasAccount ? {} : { password, name: name.trim() }) }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.success) { setDone({ email: d.email ?? inv.email, existingAccount: !!d.existingAccount, team: d.team ?? inv.team }); return; }
      if (d.field === "password") { setPwError(d.error); pwRef.current?.focus(); }
      else setError(d.error || "Something went wrong. Please try again.");
    } catch {
      setError("You seem to be offline. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <Card>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Join {inv.team}</h1>
        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {inv.inviter ? `${inv.inviter} invited you` : "You’ve been invited"} to join as <span className="font-medium text-gray-900 dark:text-white">{inv.role}</span> on Udyaibase Events.
          {inv.roleCan ? ` ${inv.roleCan}` : ""}
        </p>

        <form onSubmit={submit} noValidate className="mt-7 space-y-4">
          {/* The invited email: fixed, and given to password managers as the username */}
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Email</label>
            <input id="invite-email" type="email" name="username" autoComplete="username" value={inv.email} readOnly
              className={`${inputCls} bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 cursor-default focus:ring-0 focus:border-gray-300 dark:focus:border-gray-700`} />
          </div>

          {inv.hasAccount ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You already have an account with this email. Accept, then sign in with your existing password.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="invite-name" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Full name</label>
                <input id="invite-name" type="text" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
                  maxLength={100} className={inputCls} />
              </div>
              <PasswordField
                ref={pwRef}
                label="Password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(v) => { setPassword(v); if (pwError) setPwError(null); }}
                email={inv.email}
                showRules={password.length > 0}
                error={pwError}
                hint={password.length === 0 ? "At least 8 characters, with upper and lower case letters and a number." : undefined}
                personName={name}
              />
            </>
          )}

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="pt-2">
            <button type="submit" disabled={submitting} className={primaryBtn}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {submitting ? "Joining…" : inv.hasAccount ? "Accept invitation" : "Create account and join"}
            </button>
          </div>
        </form>
      </Card>

      <p className="mt-5 px-2 text-center text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        By continuing, you agree to the <Link href="/terms" className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200">Terms</Link> and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200">Privacy Policy</Link>.
        {" "}This invitation expires on {expires}. Not expecting it? You can ignore it.
      </p>
    </Shell>
  );
}

export default function AcceptPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand" aria-label="Loading" /></div>}>
      <AcceptContent />
    </Suspense>
  );
}
