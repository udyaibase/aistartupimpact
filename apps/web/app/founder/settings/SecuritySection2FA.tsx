'use client';

import { useState } from 'react';
import { Shield, X, Copy, Check, Download, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

interface TwoFactorSetupProps {
  isEnabled: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export default function TwoFactorSetup({ isEnabled, onClose, onSuccess, onError }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'initial' | 'qr' | 'verify' | 'backup' | 'disable'>(
    isEnabled ? 'disable' : 'initial'
  );
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // Step 1: Generate QR Code
  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/founder/2fa-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });

      const data = await res.json();

      if (data.success) {
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setStep('qr');
      } else {
        onError(data.error || 'Failed to generate QR code');
      }
    } catch (error) {
      console.error('Error generating QR code:', error);
      onError('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Code and Enable 2FA
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (verificationCode.length !== 6) {
      onError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/founder/2fa-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: verificationCode }),
      });

      const data = await res.json();

      if (data.success) {
        setBackupCodes(data.backupCodes);
        setStep('backup');
      } else {
        onError(data.error || 'Invalid verification code');
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      onError('Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Disable 2FA
  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (verificationCode.length !== 6) {
      onError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/founder/2fa-disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationCode, password: disablePassword }),
      });

      const data = await res.json();

      if (data.success) {
        onSuccess();
        onClose();
      } else {
        onError(data.error || 'Failed to disable 2FA');
      }
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      onError('Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  const downloadBackupCodes = () => {
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackupComplete = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Initial Step */}
        {step === 'initial' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-sora font-bold text-2xl text-navy dark:text-white mb-2">
                Enable Two-Factor Authentication
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
                Add an extra layer of security to your account
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300 mb-3 font-semibold">
                  How it works:
                </p>
                <ol className="text-sm text-blue-700 dark:text-blue-400 space-y-2 list-decimal list-inside">
                  <li>Scan QR code with your authenticator app</li>
                  <li>Enter the 6-digit code to verify</li>
                  <li>Save your backup codes securely</li>
                  <li>Use codes when logging in</li>
                </ol>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">
                  Recommended apps:
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Google Authenticator</li>
                  <li>• Microsoft Authenticator</li>
                  <li>• Authy</li>
                </ul>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Generating...' : 'Get Started'}
            </button>
          </>
        )}

        {/* QR Code Step */}
        {step === 'qr' && (
          <>
            <div className="text-center mb-6">
              <h3 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">
                Scan QR Code
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
                Use your authenticator app to scan this code
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 mb-4">
              {qrCode && (
                <Image
                  src={qrCode}
                  alt="2FA QR Code"
                  width={256}
                  height={256}
                  className="w-full h-auto"
                />
              )}
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Can't scan? Enter this code manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono break-all">
                  {secret}
                </code>
                <button
                  onClick={copySecret}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  {copiedSecret ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Copy className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => setStep('verify')}
              className="w-full px-6 py-3 bg-brand hover:bg-brand/90 text-white font-semibold rounded-xl transition-all"
            >
              Next: Verify Code
            </button>
          </>
        )}

        {/* Verify Step */}
        {step === 'verify' && (
          <>
            <div className="text-center mb-6">
              <h3 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">
                Verify Code
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || verificationCode.length !== 6}
                className="w-full px-6 py-3 bg-brand hover:bg-brand/90 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
              </button>

              <button
                type="button"
                onClick={() => setStep('qr')}
                className="w-full px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
              >
                Back to QR Code
              </button>
            </form>
          </>
        )}

        {/* Backup Codes Step */}
        {step === 'backup' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">
                Save Your Backup Codes
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
                Store these codes in a safe place. Each can be used once.
              </p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden /> Important: Save these codes now!
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                You won't be able to see them again. Use them if you lose access to your authenticator app.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, index) => (
                  <div key={index} className="text-gray-900 dark:text-white">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={copyBackupCodes}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {copiedBackup ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedBackup ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={downloadBackupCodes}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>

            <button
              onClick={handleBackupComplete}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all"
            >
              I've Saved My Codes
            </button>
          </>
        )}

        {/* Disable 2FA Step */}
        {step === 'disable' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">
                Disable Two-Factor Authentication
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
                Enter your current 2FA code to disable
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 dark:text-red-300">
                Disabling 2FA will make your account less secure. You'll only need your password to login.
              </p>
            </div>

            <form onSubmit={handleDisable} className="space-y-4">
              <input type="password" autoComplete="current-password" aria-label="Your password (leave empty if you only use Google)" placeholder="Your password (leave empty if you only use Google)" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-base text-gray-900 dark:text-white" />
              <div>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || verificationCode.length !== 6}
                className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Disabling...' : 'Disable 2FA'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
