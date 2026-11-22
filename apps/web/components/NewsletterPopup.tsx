'use client';

import { useState, useEffect } from 'react';
import { useHumanCheck } from '@/components/shared/useHumanCheck';
import { X, Mail, Sparkles, CheckCircle2, TrendingUp, Users, Zap } from 'lucide-react';

export default function NewsletterPopup() {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const human = useHumanCheck({ lazy: true, className: 'flex justify-center' });
  const [isTouched, setIsTouched] = useState(false);
  const [isValid, setIsValid] = useState(false);

  const validateEmail = (val: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(val);
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (!isTouched) setIsTouched(true);
    setIsValid(validateEmail(val));
  };

  // Close on Escape key press
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  useEffect(() => {
    // Check if user has already seen the popup or subscribed
    const hasSeenPopup = localStorage.getItem('ub_newsletter_popup_seen');
    const hasSubscribed = localStorage.getItem('ub_newsletter_subscribed');

    if (hasSeenPopup || hasSubscribed) {
      return;
    }

    let hasShown = false;

    // Trigger 1: After 30 seconds
    const timeoutTimer = setTimeout(() => {
      if (!hasShown) {
        hasShown = true;
        setIsVisible(true);
      }
    }, 30000); // 30 seconds

    // Trigger 2: On 50% scroll
    const handleScroll = () => {
      if (hasShown) return;
      
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercent >= 50) {
        hasShown = true;
        setIsVisible(true);
        window.removeEventListener('scroll', handleScroll);
      }
    };

    // Trigger 3: Exit intent (mouse leaves viewport)
    const handleMouseLeave = (e: MouseEvent) => {
      if (hasShown) return;
      
      if (e.clientY <= 0) {
        hasShown = true;
        setIsVisible(true);
        document.removeEventListener('mouseleave', handleMouseLeave);
      }
    };

    window.addEventListener('scroll', handleScroll);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      clearTimeout(timeoutTimer);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // Remember that user has seen the popup (don't show again for 7 days)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    localStorage.setItem('ub_newsletter_popup_seen', expiryDate.toISOString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!human.ready) { human.arm(); setError('Complete the quick security check, then join.'); return; }
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'popup', turnstileToken: human.token }),
      });
      human.reset(); // a check works once

      const data = await res.json();

      if (data.success || res.ok) {
        setIsSuccess(true);
        localStorage.setItem('ub_newsletter_subscribed', 'true');
        
        // Close popup after 3 seconds
        setTimeout(() => {
          setIsVisible(false);
        }, 3000);
      } else {
        setError(data.error || 'Failed to subscribe. Please try again.');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      setError('Failed to subscribe. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay - Lighter with better blur */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-md z-toast animate-in fade-in duration-300"
        onClick={handleClose}
      />
      {/* Popup Card */}
      <div className="fixed inset-0 z-critical flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full pointer-events-auto animate-in zoom-in-95 slide-in-from-bottom-8 fade-in duration-500 ease-out relative overflow-hidden sm:overflow-visible"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button - Responsive Position: Inside on mobile, outside on desktop */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 sm:-top-3 sm:-right-3 z-10 w-9 h-9 sm:w-10 sm:h-10 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
            aria-label="Close popup"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Content */}
          <div className="p-6 sm:p-8">
            {!isSuccess ? (
              <>
                {/* Header Value Tag */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 dark:bg-purple-900/30 rounded-full mb-4 mx-auto">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs sm:text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                    Join 5000+ AI Founders, Builders & Enthusiasts
                  </span>
                </div>

                {/* Heading */}
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white text-center mb-2 tracking-tight">
                  Don't miss the AI signal
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center mb-5 leading-relaxed max-w-sm mx-auto">
                  Get founder stories, AI startup news, fundings, launches, new AI tools, and AI innovations. Sent every Friday in your inbox.
                </p>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="popup-email" className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5 text-left pl-1 uppercase tracking-wider">
                      Enter your email address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-purple-500 dark:text-purple-400" />
                      </div>
                      <input
                        id="popup-email"
                        type="email"
                        value={email}
                        onChange={(e) => { handleEmailChange(e.target.value); human.arm(); }}
                        onFocus={human.arm}
                        placeholder="you@company.com"
                        required
                        disabled={isSubmitting}
                        autoFocus
                        className={`w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-950 border-2 rounded-xl text-sm sm:text-base text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus:shadow-md ${
                          isTouched && !isValid && email.length > 0
                            ? 'border-red-300 dark:border-red-900/50 focus:ring-red-500 focus:border-transparent'
                            : 'border-purple-200 dark:border-purple-900/40 hover:border-purple-300 dark:hover:border-purple-800 focus:ring-purple-600 dark:focus:ring-purple-500 focus:border-transparent'
                        }`}
                      />
                    </div>
                  </div>

                  {human.widget}
                  {error && (
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || (email.length > 0 && !isValid)}
                    className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl text-sm sm:text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Joining...
                      </>
                    ) : (
                      <>
                        <span>Join 5,000+ Readers</span>
                        <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300 fill-yellow-300" />
                      </>
                    )}
                  </button>
                </form>

                {/* Trusted by teams section */}
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800/80 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold mb-1">
                    Read by teams at
                  </p>
                  <p className="text-xs sm:text-xs font-bold text-gray-700 dark:text-gray-300 tracking-tight">
                    Google, Microsoft, TCS, Flipkart & Amazon
                  </p>
                </div>

                {/* Legal footnote */}
                <p className="text-xs sm:text-xs text-gray-500 dark:text-gray-400 text-center mt-3 leading-relaxed">
                  By subscribing, you agree to receive marketing emails from Udyaibase. Unsubscribe anytime with one click. Read our{' '}
                  <a href="/privacy" className="text-purple-600 dark:text-purple-400 hover:underline font-medium">
                    Privacy Policy
                  </a>.
                </p>
              </>
            ) : (
              /* Success State - Professional Design */
              <div className="text-center py-4 sm:py-6">
                {/* Success Icon with Animation */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6">
                  <div className="absolute inset-0 bg-green-100 dark:bg-green-900/30 rounded-full animate-ping opacity-75"></div>
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-white" strokeWidth={2.5} />
                  </div>
                </div>

                {/* Success Message */}
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">
                  You&apos;re subscribed!
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4 sm:mb-6 leading-relaxed max-w-sm mx-auto">
                  Welcome to the Udyaibase newsletter! You&apos;ll start receiving our weekly AI digest with the latest startups, tools, and insights.
                </p>

                {/* What's Next Section */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3.5 sm:p-4 mb-5 sm:mb-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3">
                    What happens next?
                  </h4>
                  <div className="space-y-1.5 sm:space-y-2 text-left">
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div className="w-5 h-5 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs sm:text-xs font-bold text-purple-600 dark:text-purple-400">1</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                        Check your inbox for a welcome email
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div className="w-5 h-5 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs sm:text-xs font-bold text-purple-600 dark:text-purple-400">2</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                        Receive your first digest on Friday
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div className="w-5 h-5 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs sm:text-xs font-bold text-purple-600 dark:text-purple-400">3</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                        Stay updated on India&apos;s AI ecosystem
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  onClick={handleClose}
                  className="w-full px-6 py-2.5 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm sm:text-base transition-colors shadow-lg"
                >
                  Continue Reading
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
