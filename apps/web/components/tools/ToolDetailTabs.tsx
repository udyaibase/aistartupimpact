'use client';

import { useState } from 'react';
import { Check, Zap, Target, ThumbsUp, AlertTriangle } from 'lucide-react';

interface TabItem {
  id: string;
  label: string;
  mobileLabel: string;
  icon: React.ReactNode;
  count: number;
}

interface ToolDetailTabsProps {
  features: Array<{ id: string; text: string }>;
  useCases: Array<{ id: string; text: string }>;
  pros: Array<{ id: string; text: string }>;
  cons: Array<{ id: string; text: string }>;
}

export default function ToolDetailTabs({ features, useCases, pros, cons }: ToolDetailTabsProps) {
  const tabs: TabItem[] = [
    ...(features.length > 0 ? [{ id: 'features', label: 'Key Features', mobileLabel: 'Features', icon: <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, count: features.length }] : []),
    ...(useCases.length > 0 ? [{ id: 'usecases', label: 'Use Cases', mobileLabel: 'Uses', icon: <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, count: useCases.length }] : []),
    ...(pros.length > 0 ? [{ id: 'strengths', label: 'Strengths', mobileLabel: 'Pros', icon: <ThumbsUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, count: pros.length }] : []),
    ...(cons.length > 0 ? [{ id: 'limitations', label: 'Limitations', mobileLabel: 'Cons', icon: <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, count: cons.length }] : []),
  ];

  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'features');

  if (tabs.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      {/* Tab bar — equal width on mobile, auto on desktop */}
      <div className="grid border-b border-gray-100 dark:border-gray-800 sm:flex sm:overflow-x-auto sm:scrollbar-hide"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-5 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold font-jakarta whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-brand'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.mobileLabel}</span>
            <span className={`text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id
                ? 'bg-brand/10 text-brand'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
            }`}>
              {tab.count}
            </span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 sm:p-6">
        {activeTab === 'features' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {features.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/30">
                <div className="w-5 h-5 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-3 h-3 text-brand" />
                </div>
                <p className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-300 font-jakarta leading-relaxed">
                  {item.text.replace(/^[•\-\*]\s*/, '')}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'usecases' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {useCases.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-green-50/50 dark:bg-green-900/10 border border-green-100/50 dark:border-green-800/30">
                <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-300 font-jakarta leading-relaxed">
                  {item.text.replace(/^[•\-\*]\s*/, '')}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'strengths' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {pros.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100/50 dark:border-emerald-800/30">
                <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <ThumbsUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-300 font-jakarta leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'limitations' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {cons.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100/50 dark:border-amber-800/30">
                <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-300 font-jakarta leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
