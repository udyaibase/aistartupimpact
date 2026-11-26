'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

const breakingItems = [
  'Sarvam AI raises ₹415Cr Series A led by Lightspeed to build India-first foundation models',
  'GPT-5 launches with 60% reduced pricing for Indian startups — game changer for builders',
  'India government announces ₹10,372Cr IndiaAI Mission budget for 2025-26',
  'Bangalore overtakes Singapore as Asia\'s #2 AI startup hub — CB Insights report',
  'BharatGPT open-source LLM trained on 22 Indian languages released by IIT consortium',
];

export default function BreakingTicker() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % breakingItems.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="public-preview bg-navy dark:bg-gray-900 h-9 flex items-center overflow-hidden border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex items-center gap-3">
        <span className="flex items-center gap-1 bg-brand text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0">
          <Zap className="w-2.5 h-2.5" /> Live
        </span>
        <div className="relative flex-1 overflow-hidden h-5">
          <p
            key={currentIndex}
            className="text-gray-200 text-xs sm:text-sm font-jakarta whitespace-nowrap animate-fade-in absolute inset-0 leading-5"
          >
            {breakingItems[currentIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
