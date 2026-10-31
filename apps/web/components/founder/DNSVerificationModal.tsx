'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, ShieldAlert, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';

interface Startup {
  id: string;
  name: string;
  slug: string;
}

interface DNSVerificationModalProps {
  unverifiedStartups: Startup[];
}

export default function DNSVerificationModal({ unverifiedStartups }: DNSVerificationModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (unverifiedStartups.length === 0) return;
    
    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('dns_verify_popup_dismissed');
    if (!isDismissed) {
      // Delay showing it slightly for better UX
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [unverifiedStartups]);

  const handleClose = () => {
    sessionStorage.setItem('dns_verify_popup_dismissed', 'true');
    setIsOpen(false);
  };

  const handleVerify = (startupId: string) => {
    sessionStorage.setItem('dns_verify_popup_dismissed', 'true');
    setIsOpen(false);
    router.push(`/founder/claim/${startupId}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-yellow-200 dark:border-yellow-900/30 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-6 relative">
          <button 
            onClick={handleClose} 
            className="absolute top-4 right-4 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400 shrink-0">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="font-sora font-bold text-lg text-gray-900 dark:text-white">
                Verify your startup
              </h3>
              <p className="text-xs text-yellow-800 dark:text-yellow-400 font-medium mt-0.5">
                Verification Required for Green Tick Badge
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">
            You have startup listing(s) that are claimed but not yet verified. Verify ownership to post jobs and get a <span className="font-bold text-green-600 dark:text-green-400 inline-flex items-center gap-0.5"><ShieldCheck className="w-3.5 h-3.5" /> green tick badge</span> on your profile.
          </p>

          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800/60 font-jakarta">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2.5 uppercase tracking-wider">
              Pending Startups ({unverifiedStartups.length})
            </p>
            <div className="space-y-2.5 max-h-40 overflow-y-auto">
              {unverifiedStartups.map((startup) => (
                <div key={startup.id} className="flex items-center justify-between gap-3 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-yellow-500/40 transition-colors">
                  <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                    {startup.name}
                  </span>
                  <button 
                    onClick={() => handleVerify(startup.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white font-bold text-xs rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Verify Now
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 font-jakarta flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <span>Takes about a minute with a code sent to your work email, or add a DNS TXT record instead.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button 
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
          >
            Remind Me Later
          </button>
        </div>
      </div>
    </div>
  );
}
