'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Shield, CheckCircle, Copy, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { EmailVerify } from './FounderHiringClient';

function extractDomain(url: string): string {
  try {
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(urlWithProtocol);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

interface ClaimStartupClientProps {
  startup: any;
  startupId: string;
}

export default function ClaimStartupClient({ startup, startupId }: ClaimStartupClientProps) {
  const router = useRouter();
  // If startup is already claimed by this user, start at verify step
  const initialStep = startup.claimStatus === 'CLAIMED' || startup.claimStatus === 'VERIFIED' ? 'verify' : 'confirm';
  const [step, setStep] = useState<'confirm' | 'verify' | 'success'>(initialStep);
  const [token, setToken] = useState('');
  const [dnsRecord, setDnsRecord] = useState('');
  const [domain] = useState(extractDomain(startup.websiteUrl || ''));
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(initialStep === 'verify');

  // Auto-load verification token if starting at verify step
  useEffect(() => {
    if (initialStep === 'verify' && !token) {
      initiateClaim();
    }
  }, [initialStep, token]);

  const initiateClaim = async () => {
    try {
      setError('');
      setLoading(true);
      const res = await fetch(`/api/founder/startups/${startupId}/claim`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to initiate claim');
      }
      
      const data = await res.json();
      setToken(data.token);
      setDnsRecord(data.dnsRecord);
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to initiate claim. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const checkVerification = async () => {
    setChecking(true);
    setError('');
    
    try {
      const res = await fetch(`/api/founder/startups/${startupId}/verify`);
      const data = await res.json();
      
      if (data.verified) {
        setStep('success');
      } else {
        setError(data.error || 'DNS record not found yet. Please wait a few minutes for DNS propagation.');
      }
    } catch (err) {
      setError('Verification failed. Please check your DNS settings.');
    } finally {
      setChecking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="max-w-3xl mx-auto px-4">
        
        {/* Step 1: Confirm Claim */}
        {step === 'confirm' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
                <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-navy dark:text-white">Claim Your Startup</h1>
              <p className="text-gray-600 dark:text-gray-400">Verify ownership to get your verified badge</p>
            </div>

            {/* Startup Info */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl mb-8">
              {startup.logoUrl && (
                <Image
                  src={startup.logoUrl}
                  alt={startup.name}
                  width={64}
                  height={64}
                  sizes="64px"
                  className="rounded-lg"
                />
              )}
              <div>
                <h2 className="text-xl font-bold text-navy dark:text-white">{startup.name}</h2>
                <p className="text-gray-600 dark:text-gray-400">{startup.tagline}</p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">{domain}</p>
              </div>
            </div>

            {/* Benefits */}
            <div className="space-y-3 mb-8">
              <h3 className="font-semibold text-lg mb-4 text-navy dark:text-white">What you'll get:</h3>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Verified badge on your startup profile</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Ability to update your startup information</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Access to analytics dashboard</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Increased trust and credibility</span>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={initiateClaim}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
            >
              Continue to Verification
            </button>
          </div>
        )}

        {/* Step 2: DNS Verification */}
        {step === 'verify' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
            {loading || !dnsRecord ? (
              // Loading state while fetching token
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
                  <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                </div>
                <h2 className="text-xl font-semibold mb-2 text-navy dark:text-white">Preparing Verification...</h2>
                <p className="text-gray-600 dark:text-gray-400">Generating your DNS verification record</p>
                
                {/* Show error if loading failed */}
                {error && !loading && (
                  <div className="mt-6 flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="font-medium text-red-900 dark:text-red-400">Failed to Load Verification</p>
                      <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
                      <button
                        onClick={initiateClaim}
                        className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
                    <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h1 className="text-3xl font-bold mb-2 text-navy dark:text-white">Verify Domain Ownership</h1>
                  <p className="text-gray-600 dark:text-gray-400">Prove you work at {startup.name} with a work email, or add a DNS record to {domain}</p>
                </div>

            {/* Faster option: work email on the startup's domain */}
            <div className="bg-white dark:bg-gray-900 border-2 border-green-200 dark:border-green-900/50 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-1 text-navy dark:text-white">Quickest: verify with your work email</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">We send a 6-digit code to an email on {domain}. Takes about a minute.</p>
              <EmailVerify startupId={startupId} startupName={startup.name} domain={domain} suggestedEmail="" onDone={() => setStep('success')} />
            </div>
            <p className="text-center text-sm font-semibold text-gray-500 mb-6">Or verify with DNS</p>

            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-4 text-navy dark:text-white">Step 1: Add DNS TXT Record</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Add the following TXT record to your domain's DNS settings:
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Record Type
                  </label>
                  <code className="block px-4 py-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg font-mono text-sm text-navy dark:text-white">
                    TXT
                  </code>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Name / Host
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg font-mono text-sm text-navy dark:text-white">
                      _udyaibase-verify
                    </code>
                    <button
                      onClick={() => copyToClipboard('_udyaibase-verify')}
                      className="p-3 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Some providers may require you to enter just "_udyaibase-verify" or the full subdomain
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Content / Value / TXT Data
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg font-mono text-sm break-all text-navy dark:text-white">
                      {dnsRecord}
                    </code>
                    <button
                      onClick={() => copyToClipboard(dnsRecord)}
                      className="p-3 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    This is the verification token that proves you own the domain
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    TTL (Time To Live)
                  </label>
                  <code className="block px-4 py-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg font-mono text-sm text-navy dark:text-white">
                    3600 (or use default/automatic)
                  </code>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Most DNS providers have a default TTL setting you can use
                  </p>
                </div>
              </div>

              {/* Visual Example */}
              <div className="mt-6 p-4 bg-white dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">📋 Quick Summary:</p>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex gap-2">
                    <span className="text-gray-500 dark:text-gray-400 w-20">Type:</span>
                    <span className="text-navy dark:text-white font-semibold">TXT</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 dark:text-gray-400 w-20">Name:</span>
                    <span className="text-navy dark:text-white font-semibold">_udyaibase-verify</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 dark:text-gray-400 w-20">Value:</span>
                    <span className="text-navy dark:text-white font-semibold break-all">{dnsRecord}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Provider Instructions */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 mb-6">
              <h3 className="font-bold mb-3 text-navy dark:text-white">Common DNS Providers:</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: 'Cloudflare', url: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/' },
                  { name: 'GoDaddy', url: 'https://www.godaddy.com/help/add-a-txt-record-19232' },
                  { name: 'Namecheap', url: 'https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/' },
                  { name: 'AWS Route 53', url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html' },
                ].map((provider) => (
                  <a
                    key={provider.name}
                    href={provider.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <span className="font-medium text-navy dark:text-white">{provider.name}</span>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </a>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-400">Verification Failed</p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Verify Button */}
            <button
              onClick={checkVerification}
              disabled={checking}
              className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {checking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Checking DNS Record...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Verify DNS Record
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
              ⏱ DNS propagation may take 5-10 minutes. You can close this page and come back later.
            </p>
              </>
            )}
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full mb-6">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            
            <h1 className="text-3xl font-bold mb-3 text-navy dark:text-white">🎉 Verification Successful!</h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
              Your startup is now verified
            </p>

            <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6 mb-8">
              <div className="space-y-3">
                <div className="flex items-center gap-3 justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-navy dark:text-white">Verified badge added to your profile</span>
                </div>
                <div className="flex items-center gap-3 justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-navy dark:text-white">Edit access granted</span>
                </div>
                <div className="flex items-center gap-3 justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-navy dark:text-white">Analytics dashboard unlocked</span>
                </div>
                <div className="flex items-center gap-3 justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-navy dark:text-white">Hiring unlocked: post jobs from <a href="/founder/hiring" className="text-blue-600 underline">Hiring</a></span>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => router.push(`/startups/${startup.slug}`)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-xl transition-colors"
              >
                View Startup
              </button>
              <button
                onClick={() => router.push('/founder/dashboard')}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
