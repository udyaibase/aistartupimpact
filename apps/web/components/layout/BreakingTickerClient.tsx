'use client';

import { memo } from 'react';
import { Zap } from 'lucide-react';

const defaultItems = [
  'Sarvam AI open-sources OpenHathi, its first Hindi LLM, redefining vernacular data availability',
  'QX Lab AI launches Ask QX, a multilingual generative AI platform supporting 12 Indian languages natively',
  'Cabinet approves massive ₹10,372Cr budget for the IndiaAI Mission shaping public sector innovation',
  'Krutrim AI achieves unicorn status following $50M raise from Matrix Partners India',
  'Meta partners with IndiaAI to amplify open-source innovation and train 1M developers',
];

interface BreakingTickerClientProps {
  items: string[];
}

function BreakingTickerClient({ items }: BreakingTickerClientProps) {
  const breakingItems = items.length > 0 ? items : defaultItems;
  // Duplicate for seamless loop
  const all = [...breakingItems, ...breakingItems];

  return (
    <div className="bg-navy dark:bg-gray-900 h-10 flex items-center overflow-hidden border-b border-white/5">
      <div className="w-full flex items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Pulsing dot — mobile only */}
        <span className="relative flex h-1.5 w-1.5 shrink-0 sm:hidden">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand" />
        </span>

        {/* Breaking chip — desktop only */}
        <span className="hidden sm:flex items-center gap-1 bg-brand text-white text-xs font-bold uppercase tracking-wider px-1.5 py-0.3 rounded shrink-0">
          <Zap className="w-3 h-3" aria-hidden /> Breaking
        </span>

        {/* Scrolling marquee */}
        <div className="flex-1 overflow-hidden">
          <div className="flex whitespace-nowrap animate-breaking-ticker">
            {all.map((item, i) => (
              <span key={i} className="text-gray-200 text-xs font-jakarta inline-flex items-center gap-3 pr-12">
                <span className="text-brand font-bold text-xs">◆</span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes breaking-ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-breaking-ticker {
          animation: breaking-ticker 30s linear infinite;
        }
        .animate-breaking-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

export default memo(BreakingTickerClient);
