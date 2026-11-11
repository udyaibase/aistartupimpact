import Link from 'next/link';
import { Metadata } from 'next';
import { MessageSquare, Clock } from 'lucide-react';
import { getArticlesDirect } from '@/lib/db';
import EmptyState from '@/components/ui/EmptyState';

export const metadata: Metadata = {
  title: 'Opinion & Analysis — Udyaibase',
  description:
    'Deep analysis and bold opinions on India\'s AI ecosystem from our editorial team and guest contributors.',
  alternates: { canonical: 'https://udyaibase.com/opinion' },
};

export const revalidate = 300;

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default async function OpinionPage() {
  const articles = (await getArticlesDirect({ type: 'OPINION', limit: 50 })) as any[];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="mb-6 sm:mb-10">
        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className="w-6 h-6 text-brand" />
          <h1 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">Opinion & Analysis</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm sm:text-base max-w-2xl">
          Deep analysis and bold opinions on India&apos;s AI ecosystem from our editorial team and guest contributors.
        </p>
      </div>

      {articles.length === 0 ? (
        <EmptyState
          title="No opinion articles yet"
          description="Opinion pieces will appear here once published from the admin panel."
        />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {articles.map((a) => (
            <Link key={a.slug} href={`/opinion/${a.slug}`} className="group block">
              <div className="card p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="badge-category text-xs">Opinion</span>
                  {a.category?.name && (
                    <span className="text-xs font-bold text-gray-400 font-jakarta uppercase tracking-wider">{a.category.name}</span>
                  )}
                </div>
                <h2 className="font-sora font-bold text-lg sm:text-xl text-navy dark:text-white group-hover:text-brand transition-colors leading-snug">
                  {a.title}
                </h2>
                {a.excerpt && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-jakarta mt-2 leading-relaxed line-clamp-2">{a.excerpt}</p>
                )}
                <div className="flex items-center gap-2 mt-3 text-xs text-gray-400 dark:text-gray-500 font-jakarta">
                  {a.author?.name && <span className="font-medium text-gray-500 dark:text-gray-400">{a.author.name}</span>}
                  {a.publishedAt && (
                    <>
                      <span>·</span>
                      <span>{formatDate(a.publishedAt)}</span>
                    </>
                  )}
                  {a.readTimeMinutes && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.readTimeMinutes} min</span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
