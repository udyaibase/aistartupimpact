"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle } from "lucide-react";
import PasswordField from "@/components/ui/PasswordField";
import { passwordProblem } from "@/lib/password-rules";
import { CONTROL_PRIMARY } from "@/lib/ui/form-controls";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-gray-500 font-jakarta">Invalid reset link. Please request a new one.</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/organizer/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Reset failed. The link may have expired.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/organizer"), 2000);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="font-sora font-extrabold text-xl text-navy dark:text-white">Password Reset!</h1>
        <p className="text-sm text-gray-500 font-jakarta mt-2">Redirecting to your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[400px] mx-auto px-4 py-12 sm:py-20">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-8 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Set a new password</h1>
        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">Choose a password you don’t use anywhere else.</p>

        <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
          <PasswordField
            label="New password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(v) => { setPassword(v); if (error) setError(""); }}
            showRules={password.length > 0}
            error={error || null}
            hint={password.length === 0 ? "At least 8 characters, with upper and lower case letters and a number." : undefined}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className={CONTROL_PRIMARY}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {loading ? "Saving…" : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}


export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
