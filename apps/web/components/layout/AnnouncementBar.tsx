'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Announcement {
  text: string;
  mobileText?: string;
  link: string;
  emoji: string;
  badge?: string;
}

const FALLBACK_ANNOUNCEMENTS: Announcement[] = [
  { emoji: '🚀', text: 'Submit your AI startup — Get discovered by VCs & buyers', mobileText: 'Submit your AI startup', link: '/submit-startup', badge: 'NEW' },
  { emoji: '🛠️', text: 'List your AI tool — Reach 5,000+ professionals', mobileText: 'List your AI tool', link: '/submit-tool', badge: 'HOT' },
  { emoji: '📢', text: 'Post a job — Hire top AI talent in India', mobileText: 'Post a job — Hire AI talent', link: '/employer/signup' },
  { emoji: '🎯', text: 'Upcoming AI events — Register now', mobileText: 'AI events — Register now', link: '/events' },
];

export default function AnnouncementBar() {
  const [items, setItems] = useState<Announcement[]>(FALLBACK_ANNOUNCEMENTS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<'in' | 'out'>('in');
  const [progress, setProgress] = useState(0);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch('/api/announcements/active');
      if (!res.ok) return;
      const data = await res.json();
      if (data.announcements?.length > 0) {
        setItems(data.announcements);
        setActiveIndex(0);
      }
    } catch {
      // keep fallback
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  // Auto-rotate with slide animation
  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setSlideDir('out');
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % items.length);
        setSlideDir('in');
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, [items.length]);

  // Progress bar
  useEffect(() => {
    if (items.length <= 1) return;
    setProgress(0);
    const start = Date.now();
    const duration = 5000;
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / duration, 1));
      if (elapsed < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, items.length]);

  if (items.length === 0) return null;

  const current = items[activeIndex];

  return (
    <div className="fixed top-0 left-0 right-0 z-[250] h-[44px] overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#1a0a0a] via-brand/90 to-[#1a0a0a] animate-[shimmer_6s_ease-in-out_infinite]" />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.08)_50%,transparent_75%)] bg-[length:250%_100%] animate-[shine_4s_ease-in-out_infinite]" />

      {/* Content */}
      <Link
        href={current.link}
        className="relative z-10 h-full flex items-center justify-center gap-2 px-4"
      >
        <div
          className={`flex items-center gap-1.5 sm:gap-2 transition-all duration-300 ${
            slideDir === 'in'
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-3'
          }`}
        >
          <span className="text-sm text-white" aria-hidden="true">{current.emoji}</span>

          {current.badge && (
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/15 text-white border border-white/20 backdrop-blur-sm">
              {current.badge}
            </span>
          )}

          <span className="hidden sm:inline font-jakarta text-sm font-medium text-white">
            {current.text}
          </span>
          <span className="sm:hidden font-jakarta text-xs font-medium text-white">
            {current.mobileText || current.text}
          </span>

          <span className="hidden sm:inline-flex items-center gap-1 ml-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/15 text-white border border-white/20 hover:bg-white/25 transition-colors">
            Get Started
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </span>
          <span className="sm:hidden text-brand font-bold text-sm">→</span>
        </div>
      </Link>

      {/* Progress indicator */}
      {items.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
          <div
            className="h-full bg-white/30 transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
