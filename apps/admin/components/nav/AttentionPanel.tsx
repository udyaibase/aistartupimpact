'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { ATTENTION_QUEUES, attentionText } from '@/lib/attention-queues';
import { useAttention } from '@/components/nav/AttentionProvider';

/** Everything waiting for this person, in one place, each line going straight to the section that clears it. */
export default function AttentionPanel() {
  const { counts, total, loaded } = useAttention();
  const waiting = ATTENTION_QUEUES.filter((q) => (counts[q.href] ?? 0) > 0);

  return (
    <section id="needs-attention" aria-labelledby="needs-attention-title" className="scroll-mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="needs-attention-title" className="font-sora font-bold text-lg text-navy dark:text-white">Needs attention</h2>
        {total > 0 && <p className="text-sm text-gray-600 dark:text-gray-400">{total.toLocaleString('en-IN')} waiting</p>}
      </div>
      {!loaded ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Checking what’s waiting…</p>
      ) : waiting.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden /> Nothing is waiting for you right now.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {waiting.map((q) => (
            <li key={q.href}>
              <Link href={q.href} className="group flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 px-3.5 py-3 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{attentionText(q, counts[q.href])}</span>
                <ArrowRight className="ml-auto w-4 h-4 text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
