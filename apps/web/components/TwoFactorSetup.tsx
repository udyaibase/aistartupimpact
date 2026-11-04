'use client';

import { useState } from 'react';
import { Shield, X, Copy, Check, Download } from 'lucide-react';
import Image from 'next/image';

interface TwoFactorSetupProps {
  isEnabled: boolean;
  apiBasePath: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export default function TwoFactorSetup({ isEnabled, apiBasePath, onClose, onSuccess, onError }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'initial' | 'qr' | 'verify' | 'backup' | 'disable'>(
    isEnabled ? 'disable' : 'initial'
  );
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  // Employer accounts are separate and keep their own check.
  const askPassword = apiBasePath !== '/api/employer';
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}/2fa-setup`, {
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
    } catch {
      onError('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length !== 6) { onError('Please enter a 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}/2fa-setup`, {
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
    } catch {
      onError('Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length !== 6) { onError('Please enter a 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}/2fa-disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationCode, password: disablePassword }),
      });
      const data = await res.json();
      if (data.success) { onSuccess(); onClose(); }
      else { onError(data.error || 'Failed to disable 2FA'); }
    } catch {
      onError('Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => { navigator.clipboard.writeText(secret); setCopiedSecret(true); setTimeout(() => setCopiedSecret(false), 2000); };
  const copyBackupCodes = () => { navigator.clipboard.writeText(backupCodes.join('\n')); setCopiedBackup(true); setTimeout(() => setCopiedBackup(false), 2000); };
  const downloadBackupCodes = () => {
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'backup-codes.txt'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {step === 'initial' && (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-2">Enable Two-Factor Authentication</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Add an extra layer of security to your account</p>
            </div>
            <div className="space-y-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300 mb-2 font-semibold">How it works:</p>
                <ol className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
                  <li>Scan QR code with your authenticator app</li>
                  <li>Enter the 6-digit code to verify</li>
                  <li>Save your backup codes securely</li>
                </ol>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 font-semibold">Recommended apps:</p>
                <p className="text-sm text-gray-500">Google Authenticator, Microsoft Authenticator, Authy</p>
              </div>
            </div>
            <button onClick={handleGenerate} disabled={loading} className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50">
              {loading ? 'Generating...' : 'Get Started'}
            </button>
          </>
        )}

        {step === 'qr' && (
          <>
            <div className="text-center mb-4">
              <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-1">Scan QR Code</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Use your authenticator app to scan this code</p>
            </div>
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 mb-4">
              {qrCode && <Image src={qrCode} alt="2FA QR Code" width={256} height={256} className="w-full h-auto" />}
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-2">Can't scan? Enter manually:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono break-all">{secret}</code>
                <button onClick={copySecret} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
                  {copiedSecret ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-gray-400" />}
                </button>
              </div>
            </div>
            <button onClick={() => setStep('verify')} className="w-full px-6 py-3 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl transition-all">
              Next: Verify Code
            </button>
          </>
        )}

        {step === 'verify' && (
          <>
            <div className="text-center mb-6">
              <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-1">Verify Code</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Enter the 6-digit code from your authenticator app</p>
            </div>
            <form onSubmit={handleVerify} className="space-y-4">
              <input type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all" autoFocus />
              <button type="submit" disabled={loading || verificationCode.length !== 6} className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
              </button>
              <button type="button" onClick={() => setStep('qr')} className="w-full px-6 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm transition-colors">
                Back to QR Code
              </button>
            </form>
          </>
        )}

        {step === 'backup' && (
          <>
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-1">Save Your Backup Codes</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Store these codes safely. Each can be used once.</p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold">Save these codes now — you won't see them again.</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, i) => <div key={i} className="text-gray-900 dark:text-white">{code}</div>)}
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={copyBackupCodes} className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                {copiedBackup ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiedBackup ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={downloadBackupCodes} className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
            <button onClick={() => { onSuccess(); onClose(); }} className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all">
              I've Saved My Codes
            </button>
          </>
        )}

        {step === 'disable' && (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-2">Disable Two-Factor Authentication</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Enter your current 2FA code to disable</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700 dark:text-red-300">Disabling 2FA will make your account less secure.</p>
            </div>
            <form onSubmit={handleDisable} className="space-y-4">
              {askPassword && (
                <input type="password" autoComplete="current-password" aria-label="Your password (leave empty if you only use Google)" placeholder="Your password (leave empty if you only use Google)" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-base text-gray-900 dark:text-white" />
              )}
              <input type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all" autoFocus />
              <button type="submit" disabled={loading || verificationCode.length !== 6} className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50">
                {loading ? 'Disabling...' : 'Disable 2FA'}
              </button>
              <button type="button" onClick={onClose} className="w-full px-6 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm transition-colors">Cancel</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
