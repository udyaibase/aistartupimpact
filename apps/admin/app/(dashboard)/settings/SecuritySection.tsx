'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Shield, Save, Check, Loader2, Smartphone, Copy, CheckCircle2, XCircle, AlertTriangle, Type } from 'lucide-react';

export function SecuritySection({ settings, updateSetting, Toggle, userRole }: { settings: any; updateSetting: any; Toggle: any; userRole: string }) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const orgRequires2FA = settings?.require2FA === true;
  const [twoFAStatus, setTwoFAStatus] = useState<{ enabled: boolean; backupCodesRemaining: number } | null>(null);
  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'verify' | 'backup' | 'disable'>('idle');
  const [qrCode, setQrCode] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [copied, setCopied] = useState(false);
  const { update: updateSession } = useSession();

  useEffect(() => {
    fetch('/api/admin/2fa-status').then(r => r.json()).then(data => {
      if (data.success) setTwoFAStatus({ enabled: data.enabled, backupCodesRemaining: data.backupCodesRemaining });
    }).catch(() => {});
  }, []);

  const startSetup = async () => {
    setSetupLoading(true); setSetupError('');
    try {
      const res = await fetch('/api/admin/2fa-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const data = await res.json();
      if (data.success) { setQrCode(data.qrCode); setManualSecret(data.secret); setSetupStep('qr'); }
      else setSetupError(data.error);
    } catch { setSetupError('Failed to start setup'); }
    finally { setSetupLoading(false); }
  };

  const verifySetup = async () => {
    if (verifyCode.length !== 6) { setSetupError('Enter a 6-digit code'); return; }
    setSetupLoading(true); setSetupError('');
    try {
      const res = await fetch('/api/admin/2fa-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: verifyCode }),
      });
      const data = await res.json();
      if (data.success) {
        setBackupCodes(data.backupCodes);
        // Enabling with a correct code also completes 2FA for this sign-in (otherwise you'd be asked again).
        if (data.proof) await updateSession({ twoFactorProof: data.proof });
        setSetupStep('backup');
        setTwoFAStatus({ enabled: true, backupCodesRemaining: data.backupCodes.length });
      } else setSetupError(data.error);
    } catch { setSetupError('Verification failed'); }
    finally { setSetupLoading(false); }
  };

  const disable2FA = async () => {
    if (disableCode.length !== 6) { setSetupError('Enter your current 6-digit code'); return; }
    setSetupLoading(true); setSetupError('');
    try {
      const res = await fetch('/api/admin/2fa-disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: disableCode }),
      });
      const data = await res.json();
      if (data.success) {
        await updateSession();
        setTwoFAStatus({ enabled: false, backupCodesRemaining: 0 });
        setSetupStep('idle'); setDisableCode('');
      } else setSetupError(data.error);
    } catch { setSetupError('Failed to disable 2FA'); }
    finally { setSetupLoading(false); }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Security</h2>

      {/* 2FA Section */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <Smartphone className="w-4.5 h-4.5 text-brand" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Two-Factor Authentication</h3>
            <p className="text-xs text-gray-500 font-jakarta">Secure your account with TOTP-based 2FA</p>
          </div>
          {twoFAStatus && (
            <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${twoFAStatus.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              {twoFAStatus.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>

        {twoFAStatus?.enabled && setupStep === 'idle' && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 font-jakarta">{twoFAStatus.backupCodesRemaining} backup codes remaining</p>
            {orgRequires2FA ? (
              <span className="flex items-center gap-1 text-xs text-gray-400 font-jakarta">
                <AlertTriangle className="w-3 h-3" /> Required by organization
              </span>
            ) : (
              <button onClick={() => setSetupStep('disable')} className="text-xs text-red-500 hover:text-red-600 font-semibold font-jakarta">Disable 2FA</button>
            )}
          </div>
        )}

        {!twoFAStatus?.enabled && setupStep === 'idle' && (
          <button onClick={startSetup} disabled={setupLoading}
            className="w-full py-2.5 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
            {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Enable Two-Factor Authentication
          </button>
        )}

        {setupStep === 'qr' && (
          <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta"><span className="font-semibold">Step 1:</span> Scan this QR code with Google Authenticator, Authy, or any TOTP app.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="flex justify-center"><img src={qrCode} alt="2FA QR Code" className="w-48 h-48 rounded-lg border border-gray-200 dark:border-gray-700" /></div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-[10px] text-gray-400 font-jakarta mb-1 uppercase font-semibold">Manual entry key</p>
              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all select-all">{manualSecret}</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta"><span className="font-semibold">Step 2:</span> Enter the 6-digit code from your app to verify.</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={verifyCode} onChange={(e) => { setVerifyCode(e.target.value.replace(/\D/g, '')); setSetupError(''); }}
                placeholder="000000" className="flex-1 px-3 py-2.5 text-sm font-mono text-center tracking-[0.3em] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                onKeyDown={(e) => { if (e.key === 'Enter') verifySetup(); }} />
              <button onClick={verifySetup} disabled={setupLoading || verifyCode.length !== 6}
                className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
              </button>
            </div>
            <button onClick={() => { setSetupStep('idle'); setVerifyCode(''); setSetupError(''); }} className="text-xs text-gray-400 hover:text-gray-600 font-jakarta">Cancel</button>
          </div>
        )}

        {setupStep === 'backup' && (
          <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 font-jakarta">2FA enabled successfully!</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">Save these backup codes in a secure location. Each code can only be used once.</p>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <span key={i} className="text-xs font-mono text-gray-700 dark:text-gray-300">{code}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={copyBackupCodes} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy codes'}
              </button>
              <button onClick={() => { setSetupStep('idle'); setBackupCodes([]); setVerifyCode(''); }} className="px-3 py-2 text-xs font-semibold rounded-lg bg-brand text-white hover:opacity-90 transition-opacity">Done</button>
            </div>
          </div>
        )}

        {setupStep === 'disable' && (
          <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm font-semibold text-red-600 font-jakarta">Disable Two-Factor Authentication</p>
            </div>
            <p className="text-xs text-gray-500 font-jakarta">Enter your current authenticator code to confirm.</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={disableCode} onChange={(e) => { setDisableCode(e.target.value.replace(/\D/g, '')); setSetupError(''); }}
                placeholder="000000" className="flex-1 px-3 py-2.5 text-sm font-mono text-center tracking-[0.3em] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                onKeyDown={(e) => { if (e.key === 'Enter') disable2FA(); }} />
              <button onClick={disable2FA} disabled={setupLoading || disableCode.length !== 6}
                className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable'}
              </button>
            </div>
            <button onClick={() => { setSetupStep('idle'); setDisableCode(''); setSetupError(''); }} className="text-xs text-gray-400 hover:text-gray-600 font-jakarta">Cancel</button>
          </div>
        )}

        {setupError && <p className="text-xs text-red-500 font-jakarta">{setupError}</p>}
      </div>

      {/* Session & Lockout Info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Session & Lockout Policy</h3>
        <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400 font-jakarta">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Sessions auto-expire after <span className="font-semibold text-gray-900 dark:text-white">15 minutes</span> of inactivity</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Absolute session limit: <span className="font-semibold text-gray-900 dark:text-white">1 hour</span> (re-login required)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Account lockout after <span className="font-semibold text-gray-900 dark:text-white">5 failed attempts</span> (15 min cooldown)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Authentication via <span className="font-semibold text-gray-900 dark:text-white">Google OAuth</span> (no stored passwords)</span>
          </div>
        </div>
      </div>

      {/* Site-wide settings — only SUPER_ADMIN */}
      {isSuperAdmin && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Organization Policy</h3>
          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Require 2FA for all admin users</span>
              <p className="text-xs text-gray-400 font-jakarta mt-0.5">When enabled, all team members must set up 2FA on their next login</p>
            </div>
            <Toggle value={settings.require2FA} onChange={(v: boolean) => updateSetting('require2FA', v)} />
          </div>
        </div>
      )}
    </div>
  );
}
