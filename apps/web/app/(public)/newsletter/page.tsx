'use client';

import { Check, Mail, Sparkles, TrendingUp, Zap, Target, MessageSquare, CheckCircle2, X, Wrench } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import TurnstileWidget from '@/components/shared/TurnstileWidget';

const signals = [
  { 
    icon: TrendingUp, 
    iconColor: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-500/10',
    title: 'Funding alerts', 
    desc: 'Every Friday with updates on Indian AI startups that raised new rounds of funding.' 
  },
  { 
    icon: Sparkles, 
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-500/10',
    title: 'Founder interviews', 
    desc: 'Get a behind-the-scenes look at the people building AI in India.' 
  },
  { 
    icon: Target, 
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    title: 'Tool launches', 
    desc: 'Be the first to know when new AI tools launch so you can stay up to date.' 
  },
  { 
    icon: Wrench, 
    iconColor: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-500/10',
    title: 'New AI tools', 
    desc: 'Discover the latest AI tools and releases curated for Indian builders.' 
  },
];

const faqs = [
  {
    q: 'How often will I get emails?',
    a: 'One email every Friday at 9 AM IST. No spam, no upsells, no noise. Just signal.'
  },
  {
    q: 'Will you ever spam me with promos?',
    a: 'Nope. The newsletter is 100% editorial content. If we ever add a sponsor, it will be clearly labeled and relevant to AI builders in India.'
  },
  {
    q: 'Is it really free forever?',
    a: 'Yes, always free. We may launch a premium tier later, but the core weekly digest will always be free — no credit card required.'
  },
  {
    q: 'How do I unsubscribe?',
    a: 'One click at the bottom of any email. No questions, no retention dark patterns.'
  }
];

interface Testimonial {
  id: number;
  name: string;
  role: string;
  company: string | null;
  avatar: string;
  quote: string;
  subscribed_duration: string | null;
}

interface Highlight {
  id: number;
  title: string;
  description: string;
  date: string;
  link: string | null;
}

export default function NewsletterPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);
  const [isTouched, setIsTouched] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const turnstileToken = useRef('');
  const modalTurnstileToken = useRef('');
  // A check works once: bump this after each attempt so the widgets start a fresh one.
  const [checkRound, setCheckRound] = useState(0);

  const validateEmail = (val: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(val);
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (!isTouched) setIsTouched(true);
    setIsValid(validateEmail(val));
  };
  
  // Modal state for highlight subscription
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [pendingHighlightLink, setPendingHighlightLink] = useState<string | null>(null);
  const [modalEmail, setModalEmail] = useState('');
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);

  useEffect(() => {
    fetchTestimonials();
    fetchHighlights();
  }, []);

  // Lock scroll on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Auto-rotate testimonials every 5 seconds
  useEffect(() => {
    if (testimonials.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentTestimonialIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000); // Change every 5 seconds

    return () => clearInterval(interval);
  }, [testimonials.length]);

  const fetchTestimonials = async () => {
    try {
      const res = await fetch(`/api/testimonials?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setTestimonials(data.testimonials);
      }
    } catch (error) {
      console.error('Error fetching testimonials:', error);
    }
  };

  const fetchHighlights = async () => {
    try {
      const res = await fetch(`/api/newsletter-highlights?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setHighlights(data.highlights);
      }
    } catch (error) {
      console.error('Error fetching highlights:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'newsletter_page', turnstileToken: turnstileToken.current })
      });
      turnstileToken.current = ''; setCheckRound((r) => r + 1);

      const data = await res.json();

      if (data.success || res.ok) {
        setShowSuccess(true);
        setEmail('');
        turnstileToken.current = '';
        localStorage.setItem('newsletter_subscribed', 'true');
      } else {
        alert(data.error || 'Failed to subscribe. Please try again.');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to subscribe. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHighlightClick = (link: string) => {
    // Check if user is subscribed (check localStorage)
    const isSubscribed = localStorage.getItem('newsletter_subscribed') === 'true';
    
    if (isSubscribed) {
      // User is subscribed, go directly to the link
      window.location.href = link;
    } else {
      // User is not subscribed, show modal
      setPendingHighlightLink(link);
      setShowHighlightModal(true);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsModalSubmitting(true);
    
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: modalEmail, source: 'highlight_modal', turnstileToken: modalTurnstileToken.current })
      });
      modalTurnstileToken.current = ''; setCheckRound((r) => r + 1);

      const data = await res.json();

      if (data.success || res.ok) {
        localStorage.setItem('newsletter_subscribed', 'true');
        setShowHighlightModal(false);
        setModalEmail('');
        modalTurnstileToken.current = '';
        
        // Redirect to the article
        if (pendingHighlightLink) {
          window.location.href = pendingHighlightLink;
        }
      } else {
        alert(data.error || 'Failed to subscribe. Please try again.');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to subscribe. Please try again.');
    } finally {
      setIsModalSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-950">
      <div className="md:hidden fixed top-14 bottom-0 left-0 right-0 z-10 flex flex-col justify-between p-3.5 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white overflow-hidden pb-4 sm:pb-5">
        {/* Glowing background orbs */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-brand/15 rounded-full blur-[80px] animate-pulse" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1.5s' }} />

        {/* Brand Header */}
        <div className="relative flex items-center justify-between z-10 mb-2 flex-shrink-0">
          <span className="font-sora font-extrabold text-base tracking-tight text-white">
            Udyai<span className="text-brand">base</span>
          </span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-brand/10 border border-brand/20 rounded-full">
            <span className="w-1.5 h-1.5 bg-brand rounded-full animate-ping" />
            <span className="text-xs font-bold text-brand uppercase tracking-wider">
              Free Every Friday
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative flex-1 flex flex-col justify-center items-center text-center z-10 max-w-sm mx-auto w-full">
          {/* Tag */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/5 border border-white/10 rounded-full mb-2">
            <Sparkles className="w-3 h-3 text-brand" />
            <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              Join 5000+ AI Founders, Builders & Enthusiasts
            </span>
          </div>

          {/* Heading */}
          <h1 className="font-sora font-extrabold text-xl sm:text-2xl text-white leading-tight mb-1 tracking-tight">
            Don't miss the <span className="text-brand">AI signal</span> in the noise.
          </h1>
          
          {/* Subtitle */}
          <p className="text-gray-300 text-xs leading-relaxed mb-2 font-jakarta">
            Get founder stories, AI startup news, fundings, launches, new AI tools, and AI innovations. Sent every Friday in your inbox.
          </p>

          {/* Compact 2x2 grid of signals to show content value */}
          <div className="grid grid-cols-2 gap-2 w-full mb-3 text-left">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg">
              <div className="w-5.5 h-5.5 bg-red-500/20 rounded flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-3 h-3 text-red-400" />
              </div>
              <span className="text-xs font-semibold text-gray-300">Funding Alerts</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg">
              <div className="w-5.5 h-5.5 bg-amber-500/20 rounded flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3 text-amber-400" />
              </div>
              <span className="text-xs font-semibold text-gray-300">Founder Stories</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg">
              <div className="w-5.5 h-5.5 bg-blue-500/20 rounded flex items-center justify-center flex-shrink-0">
                <Target className="w-3 h-3 text-blue-400" />
              </div>
              <span className="text-xs font-semibold text-gray-300">Tool Launches</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg">
              <div className="w-5.5 h-5.5 bg-purple-500/20 rounded flex items-center justify-center flex-shrink-0">
                <Wrench className="w-3 h-3 text-purple-400" />
              </div>
              <span className="text-xs font-semibold text-gray-300">New AI Tools</span>
            </div>
          </div>

          {/* Subscription Form */}
          {!showSuccess ? (
            <form onSubmit={handleSubmit} className="w-full space-y-2.5">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-3.5 w-3.5 text-brand" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  disabled={isSubmitting}
                  className={`w-full pl-9 pr-4 py-3 bg-white/10 backdrop-blur-sm border rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 font-jakarta text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${
                    isTouched && !isValid && email.length > 0
                      ? 'border-red-400 focus:ring-red-500'
                      : 'border-white/20 focus:ring-brand/50 focus:border-brand'
                  }`}
                />
              </div>

              <TurnstileWidget
                key={checkRound}
                onSuccess={(token) => { turnstileToken.current = token; }}
                onExpire={() => { turnstileToken.current = ''; }}
                className="flex justify-center"
              />

              <button
                type="submit"
                disabled={isSubmitting || (email.length > 0 && !isValid)}
                className="w-full px-5 py-3 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs disabled:cursor-not-allowed shadow-lg shadow-brand/30 active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Subscribing...
                  </>
                ) : (
                  <>
                    <span>Join 5,000+ Readers</span>
                    <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                  </>
                )}
              </button>

              {/* Trust Bar just below CTA button */}
              <div className="pt-2 text-center w-full">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-0.5">
                  Read by teams at
                </p>
                <p className="text-xs font-bold text-gray-200 tracking-tight mb-1">
                  Google, Microsoft, TCS, Flipkart & Amazon
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  By subscribing, you agree to receive the Udyaibase newsletter. <a href="/privacy" className="underline hover:text-gray-400">Unsubscribe</a> anytime.
                </p>
              </div>
            </form>
          ) : (
            <div className="text-center py-4 bg-white/5 border border-white/10 rounded-2xl px-5 w-full">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="font-sora font-bold text-lg text-white mb-1.5">
                Successfully Subscribed!
              </h4>
              <p className="text-gray-300 text-xs font-jakarta mb-4">
                Confirmation email sent. Your first AI digest arrives this Friday!
              </p>
              <button
                onClick={() => setShowSuccess(false)}
                className="text-brand hover:text-brand/80 font-bold text-xs font-jakarta"
              >
                Subscribe another email →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Desktop view: original scrollable content */}
      <div className="hidden md:block">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 border-b border-white/10">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Content */}
            <div>
              <div className="inline-flex items-center gap-2 bg-brand/10 border border-brand/20 px-4 py-2 rounded-full mb-6">
                <span className="w-2 h-2 bg-brand rounded-full animate-pulse" />
                <span className="text-brand text-xs font-bold uppercase tracking-wider font-jakarta">
                  FREE EVERY FRIDAY AT 9 AM IST
                </span>
              </div>

              <h1 className="font-sora font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight mb-4">
                Don&apos;t miss the{' '}
                <span className="text-brand">AI signal</span>
                <br />
                in the noise.
              </h1>

              <p className="text-gray-300 text-base sm:text-lg font-jakarta leading-relaxed mb-6 max-w-xl">
                India&apos;s most curated AI newsletter — funding rounds, founder stories, and tool releases. Signal only, no noise.
              </p>

              {/* Benefits List */}
              <div className="space-y-2.5 mb-6">
                <div className="flex items-center gap-3 text-gray-300 font-jakarta text-sm sm:text-base">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-brand flex-shrink-0" />
                  <span>Exclusive founder interviews</span>
                </div>
                <div className="flex items-center gap-3 text-gray-300 font-jakarta text-sm sm:text-base">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-brand flex-shrink-0" />
                  <span>Tool reviews & recommendations</span>
                </div>
                <div className="flex items-center gap-3 text-gray-300 font-jakarta text-sm sm:text-base">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-brand flex-shrink-0" />
                  <span>Curated new AI tools</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center -space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 border-2 border-[#0d1829] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">RK</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 border-2 border-[#0d1829] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">PM</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 border-2 border-[#0d1829] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">SJ</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 border-2 border-[#0d1829] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">AV</span>
                  </div>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm font-sora">5,000+</p>
                  <p className="text-gray-400 text-xs font-jakarta">founders, investors & engineers</p>
                </div>
              </div>
            </div>

            {/* Right Form */}
            <div className="lg:pl-8">
              <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl border border-gray-200 dark:border-gray-800">
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-brand/20 rounded-full blur-2xl" />
                
                <div className="relative">
                  <div className="text-center mb-6">
                    <h3 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white mb-2">
                      Join 5,000+ readers
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-jakarta">
                      Get the weekly AI digest every Friday
                    </p>
                  </div>

                  {!showSuccess ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          required
                          disabled={isSubmitting}
                          className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 font-jakarta text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      <TurnstileWidget
                key={checkRound}
                        onSuccess={(token) => { turnstileToken.current = token; }}
                        onExpire={() => { turnstileToken.current = ''; }}
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full px-6 py-3.5 bg-brand hover:bg-brand/90 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed shadow-lg shadow-brand/30"
                      >
                        {isSubmitting ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Subscribing...
                          </>
                        ) : (
                          <>
                            Get the weekly digest
                            <Mail className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      <p className="text-center text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-2 leading-relaxed">
                        By subscribing, you agree to receive the Udyaibase newsletter. You can{' '}
                        <a href="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300">unsubscribe</a> at any time.
                      </p>
                    </form>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h4 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">
                        Successfully Subscribed!
                      </h4>
                      <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta mb-6">
                        You&apos;re all set! You&apos;ll receive your first AI digest this Friday.
                      </p>
                      <button
                        onClick={() => setShowSuccess(false)}
                        className="text-brand hover:text-brand/80 font-semibold text-sm font-jakarta"
                      >
                        Subscribe another email →
                      </button>
                    </div>
                  )}

                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-center text-xs text-gray-500 dark:text-gray-400 font-jakarta">
                      Read by teams at{' '}
                      <span className="text-gray-700 dark:text-gray-300 font-semibold">Google India</span>,{' '}
                      <span className="text-gray-700 dark:text-gray-300 font-semibold">Flipkart</span> &{' '}
                      <span className="text-gray-700 dark:text-gray-300 font-semibold">Zerodha</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Four Signals Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center mb-12">
          <span className="text-brand text-xs font-bold uppercase tracking-wider font-jakarta">
            WHAT YOU&apos;LL GET
          </span>
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mt-3">
            Four signals, zero noise.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {/* Funding alerts */}
          <div className="group bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl" />
            <div className="relative">
              <div className="w-12 h-12 bg-red-500/20 dark:bg-red-500/30 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white mb-2">
                {signals[0].title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm font-jakarta leading-relaxed">
                {signals[0].desc}
              </p>
            </div>
          </div>

          {/* Founder interviews */}
          <div className="group bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
            <div className="relative">
              <div className="w-12 h-12 bg-amber-500/20 dark:bg-amber-500/30 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white mb-2">
                {signals[1].title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm font-jakarta leading-relaxed">
                {signals[1].desc}
              </p>
            </div>
          </div>

          {/* Tool launches */}
          <div className="group bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
            <div className="relative">
              <div className="w-12 h-12 bg-blue-500/20 dark:bg-blue-500/30 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white mb-2">
                {signals[2].title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm font-jakarta leading-relaxed">
                {signals[2].desc}
              </p>
            </div>
          </div>

          {/* Policy briefs */}
          <div className="group bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
            <div className="relative">
              <div className="w-12 h-12 bg-purple-500/20 dark:bg-purple-500/30 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white mb-2">
                {signals[3].title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm font-jakarta leading-relaxed">
                {signals[3].desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* See What You've Been Missing Section */}
      {highlights.length > 0 && (
      <section className="bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-800 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-brand text-xs font-bold uppercase tracking-wider font-jakarta">
              RECENT HIGHLIGHTS
            </span>
            <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mt-3">
              See what you&apos;ve been missing.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {highlights.map((highlight) => (
              <div key={highlight.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <span className="text-brand text-xs font-bold uppercase tracking-wider font-jakarta">
                  {highlight.date}
                </span>
                <h3 className="font-sora font-bold text-lg sm:text-xl text-navy dark:text-white mt-3 mb-2">
                  {highlight.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta leading-relaxed mb-4">
                  {highlight.description}
                </p>
                {highlight.link && highlight.link !== '#' && (
                  <button
                    onClick={() => handleHighlightClick(highlight.link!)}
                    className="text-brand hover:text-brand/80 font-semibold text-sm font-jakarta inline-flex items-center gap-1 cursor-pointer"
                  >
                    Read more →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Newsletter Signup Modal for Highlights */}
      {showHighlightModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowHighlightModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-brand" />
              </div>
              <h3 className="font-sora font-bold text-2xl text-navy dark:text-white mb-2">
                Subscribe to Read
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
                Get access to this article and receive our weekly AI digest every Friday
              </p>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              <div>
                <input
                  type="email"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={isModalSubmitting}
                  className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-navy dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 font-jakarta text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <TurnstileWidget
                key={checkRound}
                onSuccess={(token) => { modalTurnstileToken.current = token; }}
                onExpire={() => { modalTurnstileToken.current = ''; }}
              />
              <button
                type="submit"
                disabled={isModalSubmitting}
                className="w-full px-6 py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed shadow-lg shadow-purple-600/30"
              >
                {isModalSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Subscribing...
                  </>
                ) : (
                  <>
                    Subscribe & Continue
                    <Mail className="w-4 h-4" />
                  </>
                )}
              </button>
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-2 leading-relaxed">
                By subscribing, you agree to receive the Udyaibase newsletter. You can{' '}
                <a href="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300">unsubscribe</a> at any time.
              </p>
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1">
                Free forever · No spam
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Testimonial Section - Auto-rotating carousel */}
      {testimonials.length > 0 && (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-6">
          <span className="text-brand text-xs font-bold uppercase tracking-wider font-jakarta">
            FROM OUR READERS
          </span>
        </div>

        {/* Single testimonial card with fade transition */}
        <div className="relative">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.id}
              className={`transition-opacity duration-700 ${
                index === currentTestimonialIndex ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'
              }`}
            >
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-lg">
                <p className="text-gray-700 dark:text-gray-300 text-base sm:text-lg font-jakarta leading-relaxed mb-6 italic">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">{testimonial.avatar}</span>
                  </div>
                  <div>
                    <p className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">{testimonial.name}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-jakarta">
                      {testimonial.role}
                      {testimonial.company && `, ${testimonial.company}`}
                      {testimonial.subscribed_duration && ` · ${testimonial.subscribed_duration}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Dots indicator - Directly below the card */}
          {testimonials.length > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentTestimonialIndex(index)}
                  className={`transition-all duration-300 rounded-full ${
                    index === currentTestimonialIndex
                      ? 'w-8 h-2 bg-brand'
                      : 'w-2 h-2 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600'
                  }`}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>
      )}

      {/* FAQ Section */}
      <section className="bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-800 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-brand text-xs font-bold uppercase tracking-wider font-jakarta">
              COMMON QUESTIONS
            </span>
            <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white mt-3 mb-2">
              No surprises.
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base font-jakarta max-w-2xl mx-auto">
              Everything you need to know about our newsletter.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
            {faqs.map((faq, idx) => (
              <div 
                key={idx}
                className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-200"
              >
                <div className="p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center flex-shrink-0 group-hover:bg-brand/20 dark:group-hover:bg-brand/30 transition-colors">
                      <span className="text-brand font-bold text-base font-sora">{idx + 1}</span>
                    </div>
                    <div className="flex-1 pt-1">
                      <h3 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white mb-2 leading-snug">
                        {faq.q}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta leading-relaxed">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 py-16 sm:py-20">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl lg:text-4xl text-white mb-3 sm:mb-4">
            Ready to read what India&apos;s<br />AI builders are reading?
          </h2>
          <p className="text-gray-300 text-base sm:text-lg font-jakarta mb-6 sm:mb-8">
            Join 5,000+ subscribers. Free, every Friday.
          </p>
          
          <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={isSubmitting}
                className="flex-1 px-4 py-3.5 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 font-jakarta text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-8 py-3.5 bg-brand hover:bg-brand/90 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed shadow-lg shadow-brand/30 whitespace-nowrap"
              >
                {isSubmitting ? 'Subscribing...' : 'Subscribe free'}
              </button>
            </div>
            <TurnstileWidget
                key={checkRound}
              onSuccess={(token) => { turnstileToken.current = token; }}
              onExpire={() => { turnstileToken.current = ''; }}
              className="flex justify-center"
            />
          </form>

          <p className="text-gray-400 text-xs font-jakarta mt-4">
            No credit card required · Unsubscribe in 1 click
          </p>
        </div>
      </section>
      </div> {/* End of Desktop view hidden md:block */}
    </div>
  );
}
