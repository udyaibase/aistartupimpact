'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Wrench, Mail, AlertCircle, Database } from 'lucide-react';
import { fixNullImpactScoresAction } from '../startups-dir/actions';

export default function DevToolsPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixResult, setFixResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleVerifyEmail = async () => {
    if (!email) {
      setResult({ success: false, message: 'Please enter an email address' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('http://localhost:3000/api/founder/auth/manual-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, message: data.message });
        setEmail('');
      } else {
        setResult({ success: false, message: data.error || 'Verification failed' });
      }
    } catch (error) {
      setResult({ success: false, message: 'Failed to connect to API' });
    } finally {
      setLoading(false);
    }
  };

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="portal-title">Development Tools</h1>
          <p className="portal-subtitle">
            Tools for development and testing
          </p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                Dev tools are only available in development mode.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="portal-title flex items-center gap-2">
          <Wrench className="h-7 w-7 text-brand" />
          Development Tools
        </h1>
        <p className="portal-subtitle">
          Tools for development and testing (only available in dev mode)
        </p>
      </div>

      {/* Manual Email Verification Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Manual Email Verification</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-jakarta">
            Manually verify a founder's email address without requiring them to click the verification link.
            Useful when email sending is not configured or for testing purposes.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Email Input */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 font-jakarta">
              Founder Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="email"
                type="email"
                placeholder="founder@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && email && handleVerifyEmail()}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta"
              />
            </div>
          </div>

          {/* Verify Button */}
          <button
            onClick={handleVerifyEmail}
            disabled={loading || !email}
            className="w-full bg-brand hover:bg-brand/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors font-jakarta"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Verifying...
              </span>
            ) : (
              'Verify Email'
            )}
          </button>

          {/* Result Message */}
          {result && (
            <div className={`rounded-lg p-4 ${
              result.success 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <p className={`text-sm font-medium ${
                  result.success 
                    ? 'text-green-900 dark:text-green-200' 
                    : 'text-red-900 dark:text-red-200'
                }`}>
                  {result.message}
                </p>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-200 mb-2 font-jakarta">How to use:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-300 font-jakarta">
              <li>Enter the founder's email address</li>
              <li>Click "Verify Email"</li>
              <li>The founder can now login without clicking the verification link</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Fix Null Impact Scores Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-brand" />
            Fix Null Impact Scores
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-jakarta">
            Sets all startups with null impactScore to 0. Run this after data migrations or imports.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <button
            onClick={async () => {
              setFixLoading(true);
              setFixResult(null);
              try {
                const res = await fixNullImpactScoresAction();
                setFixResult({
                  success: res.success,
                  message: res.success ? (res as any).message || 'Fixed successfully' : (res as any).error || 'Failed',
                });
              } catch {
                setFixResult({ success: false, message: 'Failed to run fix' });
              }
              setFixLoading(false);
            }}
            disabled={fixLoading}
            className="w-full bg-brand hover:bg-brand/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors font-jakarta"
          >
            {fixLoading ? 'Running...' : 'Fix Null Scores'}
          </button>
          {fixResult && (
            <div className={`rounded-lg p-4 ${
              fixResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-start gap-3">
                {fixResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <p className={`text-sm font-medium ${
                  fixResult.success ? 'text-green-900 dark:text-green-200' : 'text-red-900 dark:text-red-200'
                }`}>{fixResult.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
