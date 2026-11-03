"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield, Loader2, LogOut } from "lucide-react";

export default function Verify2FAPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if ((session as any)?.twoFactorVerified) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newCode.every(d => d !== "")) handleVerify(newCode.join(""));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      handleVerify(pasted);
    }
  };

  const handleVerify = async (token: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useBackup ? { backupCode: backupCode || token } : { token }),
      });
      const data = await res.json();
      if (data.success && data.proof) {
        // The proof is signed by the server; the session only counts as verified if it checks out.
        const updated: any = await update({ twoFactorProof: data.proof });
        if (!updated?.twoFactorVerified) {
          setError("Couldn't confirm your sign-in. Refresh the page and try again.");
          return;
        }
        router.replace("/dashboard");
      } else {
        setError(data.error || "Invalid code");
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupVerify = async () => {
    if (!backupCode.trim()) return;
    await handleVerify(backupCode.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-brand" />
            </div>
            <h1 className="text-lg font-sora font-bold text-gray-900 dark:text-white">Two-Factor Authentication</h1>
            <p className="text-sm text-gray-500 mt-1 font-jakarta">
              {useBackup
                ? "Enter one of your backup codes"
                : "Enter the 6-digit code from your authenticator app"}
            </p>
          </div>

          {!useBackup ? (
            <>
              <div className="flex gap-2 justify-center mb-4" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="w-11 h-13 text-center text-xl font-mono font-bold border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-brand outline-none transition-all"
                    disabled={loading}
                  />
                ))}
              </div>

              <button
                onClick={() => setUseBackup(true)}
                className="text-xs text-gray-400 hover:text-brand transition-colors font-jakarta block mx-auto mb-4"
              >
                Use a backup code instead
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                value={backupCode}
                onChange={e => { setBackupCode(e.target.value.toUpperCase()); setError(""); }}
                placeholder="Enter backup code"
                className="w-full px-3 py-2.5 text-sm text-center font-mono tracking-widest border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white mb-3"
                onKeyDown={e => { if (e.key === "Enter") handleBackupVerify(); }}
                disabled={loading}
              />
              <button
                onClick={handleBackupVerify}
                disabled={loading || !backupCode.trim()}
                className="w-full py-2.5 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity mb-3"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verify Backup Code"}
              </button>
              <button
                onClick={() => { setUseBackup(false); setBackupCode(""); setError(""); }}
                className="text-xs text-gray-400 hover:text-brand transition-colors font-jakarta block mx-auto mb-4"
              >
                Use authenticator app instead
              </button>
            </>
          )}

          {error && <p className="text-xs text-red-500 text-center mb-3">{error}</p>}

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors font-jakarta mx-auto"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
