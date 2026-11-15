'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Shield, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import StartupDomainVerify from './StartupDomainVerify';

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
  /** Verified by another founder: only a DNS record can take it over ('dns' also needs their record to be gone). */
  takeover?: false | 'email' | 'dns';
  initialMethod?: 'email' | 'dns';
  /** The work email used last time (owner re-verifying), offered first. */
  workEmailHint?: string | null;
}

export default function ClaimStartupClient({ startup, startupId, takeover = false, initialMethod, workEmailHint }: ClaimStartupClientProps) {
  const router = useRouter();
  // If startup is already claimed by this user, start at verify step
  const initialStep = startup.claimStatus === 'CLAIMED' || startup.claimStatus === 'VERIFIED' ? 'verify' : 'confirm';
  const [step, setStep] = useState<'confirm' | 'verify' | 'success'>(initialStep);
  const [domain] = useState(extractDomain(startup.websiteUrl || ''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to initiate claim. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div>
        
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
                <span className="text-gray-700 dark:text-gray-300">Your profile, tools, stories, jobs and view history in one dashboard</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Increased trust and credibility</span>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Next, you’ll prove you control {domain || 'your startup’s domain'}, with a DNS record or a work email. You become the owner as soon as that’s done. Until then, nothing on the profile changes.
            </p>

            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={initiateClaim}
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              Continue to Verification
            </button>
          </div>
        )}

        {/* Step 2: DNS Verification */}
        {step === 'verify' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 sm:p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 dark:bg-blue-900 rounded-full mb-3">
                <Shield className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-navy dark:text-white">Verify domain ownership</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Prove you control {domain || 'your startup’s domain'}, with a work email or a DNS record. You become the owner as soon as that’s done. Until then, nothing on the profile changes.
              </p>
            </div>
            {takeover && (
              <p className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
                {takeover === 'email'
                  ? `${startup.name} was verified with a work email by another founder. A DNS record is stronger proof: add yours to take over ownership. They’ll be told.`
                  : `${startup.name} is verified by another founder’s DNS record. You can take over only if their record is no longer on the domain (for example, the domain changed hands). They’ll be told.`}
              </p>
            )}
            <StartupDomainVerify
              startupId={startupId}
              startupName={startup.name}
              websiteUrl={startup.websiteUrl || ''}
              dnsOnly={!!takeover}
              initialMethod={initialMethod}
              workEmailHint={workEmailHint}
              onVerified={() => setStep('success')}
            />
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full mb-6">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            
            <h1 className="text-3xl font-bold mb-3 text-navy dark:text-white">{startup.name} is now yours</h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
              You’re verified. Everything we already had for it is now in your dashboard.
            </p>

            <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6 mb-8">
              <ul className="space-y-3 text-left">
                {[
                  { href: `/founder/startups/${startup.slug}`, title: 'Your profile', body: 'Check your details, founders, funding and links, and keep them up to date.' },
                  { href: '/founder/tools', title: 'Your AI tools', body: 'Any tools listed on your domain are now yours to edit.' },
                  { href: '/founder/analytics', title: 'Your views', body: 'See how many people have already viewed your listing.' },
                  { href: '/founder/content', title: 'Your stories', body: 'See the articles that mention you, and post your own updates.' },
                  { href: '/founder/hiring', title: 'Your jobs', body: 'Manage jobs already listed for your startup, or post a new one.' },
                  { href: '/founder/events', title: 'Your events', body: 'See events tagged with your startup, or host your own.' },
                ].map((item) => (
                  <li key={item.href} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" aria-hidden />
                    <span className="text-gray-700 dark:text-gray-300">
                      <Link href={item.href} className="font-semibold text-navy dark:text-white hover:underline">{item.title}</Link>
                      <span className="block text-sm">{item.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
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
