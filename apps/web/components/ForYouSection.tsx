'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Star, Briefcase, Rocket, Wrench, Newspaper, CalendarDays } from 'lucide-react';
import type { Rec, RecType } from '@/lib/personalization/recommend';

const TYPES: Record<RecType, { label: string; icon: typeof Wrench }> = {
  article: { label: 'Article', icon: Newspaper },
  tool: { label: 'Tool', icon: Wrench },
  startup: { label: 'Startup', icon: Rocket },
  job: { label: 'Job', icon: Briefcase },
  event: { label: 'Event', icon: CalendarDays },
};

/** Home page "For you": picked from what the person told us and what they've looked at; each card says why. */
export default function ForYouSection() {
  const [items, setItems] = useState<Rec[] | null>(null);

  useEffect(() => {
    fetch('/api/user/recommendations')
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data.items) ? data.items : []))
      .catch(() => setItems([]));
  }, []);

  if (!items?.length) return null;

  return (
    <section className="py-8 sm:py-12" aria-labelledby="for-you-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 id="for-you-title" className="font-sora text-lg sm:text-xl font-bold text-gray-900 dark:text-white">For you</h2>
            <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">Based on your interests and what you’ve read.</p>
          </div>
          <Link href="/profile?tab=preferences" className="shrink-0 inline-flex items-center gap-1 min-h-[40px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">
            Edit interests <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {items.map((item) => {
            const type = TYPES[item.type] ?? TYPES.tool;
            const Icon = type.icon;
            return (
              <li key={`${item.type}-${item.id}`}>
                <Link
                  href={item.href}
                  className="group h-full flex gap-3 p-4 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
                >
                  <div className="shrink-0">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt="" width={44} height={44} className="w-11 h-11 rounded-[10px] object-cover border border-gray-200 dark:border-gray-700" />
                    ) : (
                      <div className="w-11 h-11 rounded-[10px] border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                        <Icon className="w-5 h-5" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{type.label}</p>
                    <p className="mt-0.5 font-semibold text-[14px] leading-snug text-gray-900 dark:text-white line-clamp-2 group-hover:underline underline-offset-2">{item.title}</p>
                    {item.subtitle && <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400 line-clamp-1">{item.subtitle}</p>}
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
                      <span className="truncate">{item.reason}</span>
                      {item.rating != null && Number(item.rating) > 0 && (
                        <span className="shrink-0 inline-flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-current" aria-hidden />{Number(item.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
