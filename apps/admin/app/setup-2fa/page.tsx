"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield, Loader2, LogOut, Copy, Check, CheckCircle2 } from "lucide-react";

export default function Setup2FAPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<"qr" | "verify" | "backup">("qr");
  const [qrCode, setQrCode] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    generateSecret();
  }, []);

  const generateSecret = async () => {
    try {
      const res = await fetch("/api/admin/2fa-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json();
      if (data.success) {
        setQrCode(data.qrCode);
        setManualSecret(data.secret);
      } else {
        setError("Failed to generate QR code. Please try again.");
      }
    } catch {
      setError("Failed to connect. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newCode.every(d => d !== "")) verifyCode(newCode.join(""));
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
      verifyCode(pasted);
    }
  };

  const verifyCode = async (token: string) => {
    setVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/admin/2fa-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", token }),
      });
      const data = await res.json();
      if (data.success) {
        setBackupCodes(data.backupCodes);
        // Enabling with a correct code also completes 2FA for this sign-in.
        if (data.proof) await update({ twoFactorProof: data.proof });
        setStep("backup");
      } else {
        setError(data.error || "Invalid code");
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finishSetup = () => {
    router.replace("/dashboard");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-brand" />
            </div>
            <h1 className="text-xl font-sora font-bold text-gray-900 dark:text-white">
              {step === "backup" ? "Save Your Backup Codes" : "Set Up Two-Factor Authentication"}
            </h1>
            <p className="text-sm text-gray-500 mt-2 font-jakarta">
              {step === "qr" && "Your organization requires 2FA. Scan the QR code with your authenticator app to continue."}
              {step === "verify" && "Enter the 6-digit code from your authenticator app."}
              {step === "backup" && "Store these codes somewhere safe. Each can be used once if you lose access to your authenticator."}
            </p>
          </div>

          {/* Step: QR Code */}
          {step === "qr" && (
            <div className="space-y-5">
              {qrCode && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCode} alt="2FA QR Code" className="w-52 h-52 rounded-xl border border-gray-200 dark:border-gray-700" />
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-[10px] text-gray-400 font-jakarta mb-1 uppercase font-semibold tracking-wide">Can't scan? Enter this key manually</p>
                <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all select-all">{manualSecret}</p>
              </div>

              <p className="text-xs text-gray-500 font-jakarta text-center">
                Use <span className="font-semibold">Google Authenticator</span>, <span className="font-semibold">Authy</span>, or any TOTP app
              </p>

              <button
                onClick={() => { setStep("verify"); setTimeout(() => inputRefs.current[0]?.focus(), 100); }}
                className="w-full py-3 text-sm font-semibold rounded-xl bg-brand text-white hover:opacity-90 transition-opacity"
              >
                I've scanned the code
              </button>
            </div>
          )}

          {/* Step: Verify */}
          {step === "verify" && (
            <div className="space-y-5">
              <div className="flex gap-2 justify-center" onPaste={handlePaste}>
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
                    className="w-12 h-14 text-center text-xl font-mono font-bold border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-brand outline-none transition-all"
                    disabled={verifying}
                  />
                ))}
              </div>

              {verifying && (
                <div className="flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                </div>
              )}

              <button
                onClick={() => { setStep("qr"); setCode(["", "", "", "", "", ""]); setError(""); }}
                className="text-xs text-gray-400 hover:text-brand transition-colors font-jakarta block mx-auto"
              >
                Back to QR code
              </button>
            </div>
          )}

          {/* Step: Backup Codes */}
          {step === "backup" && (
            <div className="space-y-5">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm font-semibold text-green-600 dark:text-green-400 font-jakarta">2FA enabled successfully</span>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-2">
                {backupCodes.map((c, i) => (
                  <span key={i} className="text-sm font-mono text-gray-700 dark:text-gray-300 text-center py-1">{c}</span>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyBackupCodes}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy codes"}
                </button>
                <button
                  onClick={finishSetup}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-brand text-white hover:opacity-90 transition-opacity"
                >
                  Continue to Dashboard
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500 text-center mt-3">{error}</p>}

          {/* Sign out */}
          <div className="border-t border-gray-100 dark:border-gray-800 mt-6 pt-4">
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
