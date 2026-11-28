import SponsoredTag from '@/components/article/SponsoredTag';
import Link from 'next/link';
import Image from 'next/image';
import { PenLine } from 'lucide-react';
import StoryCover from './StoryCover';
import { formatStoryDate, initials, isFounderWritten, storyTopic } from './storyMeta';

export interface StoryCardData {
  slug: string;
  title: string;
  type?: string | null;
  excerpt?: string | null;
  coverImage?: string | null;
  thumbnailImage?: string | null;
  publishedAt?: string | null;
  readTimeMinutes?: number | null;
  founderWritten?: boolean | null;
  author?: { name?: string | null; avatar?: string | null } | null;
  category?: { name?: string | null } | null;
  startupName?: string | null;
  startupLogo?: string | null;
}

export function FounderBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold font-jakarta ${dark ? 'bg-white/15 text-white' : 'bg-brand/10 text-brand'}`}>
      <PenLine className="h-3 w-3" aria-hidden /> By the founder
    </span>
  );
}

export function Byline({ story, size = 'sm' }: { story: StoryCardData; size?: 'sm' | 'md' }) {
  const name = story.author?.name;
  const avatar = story.author?.avatar || (isFounderWritten(story) ? story.startupLogo : null);
  const px = size === 'md' ? 28 : 24;
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px] sm:text-xs text-gray-500 dark:text-gray-400 font-jakarta">
      {name && (
        <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-600 dark:text-gray-300"
          style={{ width: px, height: px }} aria-hidden>
          {avatar ? <Image src={avatar} alt="" width={px} height={px} sizes={`${px}px`} className="h-full w-full object-cover" /> : initials(name)}
        </span>
      )}
      <span className="min-w-0 truncate">
        {name && <span className="font-semibold text-gray-700 dark:text-gray-200">{name}</span>}
        {name && story.publishedAt && <span aria-hidden> · </span>}
        {story.publishedAt && <time dateTime={story.publishedAt}>{formatStoryDate(story.publishedAt)}</time>}
        {story.readTimeMinutes ? <span className={size === 'md' ? '' : 'hidden sm:inline'}><span aria-hidden> · </span>{story.readTimeMinutes} min read</span> : null}
      </span>
    </div>
  );
}

/**
 * One story. On phones it's a list row (text on the left, a small square picture on the right, like a news app),
 * from the sm breakpoint up a card with the picture on top.
 */
export default function StoryCard({ story, sizes = '(max-width: 640px) 96px, (max-width: 1024px) 50vw, 33vw', href }: { story: StoryCardData; sizes?: string; /** Where it opens; stories by default (news uses the same card). */ href?: string }) {
  const founder = isFounderWritten(story);
  return (
    <Link href={href ?? `/stories/${story.slug}`}
      className="group flex flex-row-reverse items-start gap-3 border-b border-gray-100 dark:border-gray-800 py-4 active:bg-gray-50 dark:active:bg-gray-900 max-sm:last:border-b-0
        sm:h-full sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:rounded-[14px] sm:border sm:border-gray-200 sm:dark:border-gray-800 sm:bg-white sm:dark:bg-gray-900 sm:py-0 sm:active:bg-white
        transition-[border-color,box-shadow] duration-200 sm:hover:border-gray-300 sm:dark:hover:border-gray-700 sm:hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <StoryCover src={story.thumbnailImage || story.coverImage} title={story.title} topic={storyTopic(story)}
        logo={story.startupLogo} name={story.startupName || story.author?.name} sizes={sizes} thumbOnPhone
        className="h-24 w-24 shrink-0 rounded-[12px] sm:h-auto sm:w-full sm:rounded-none sm:aspect-[16/9]" />
      <div className="flex min-w-0 flex-1 flex-col sm:p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:mb-2">
          <span className={`text-xs font-bold uppercase tracking-wider text-brand font-jakarta ${founder ? 'hidden sm:inline' : ''}`}>{storyTopic(story)}</span>
          {founder && <FounderBadge />}
          {(story.type === 'SPONSORED' || (story as { isSponsored?: boolean }).isSponsored) && <SponsoredTag />}
        </div>
        <h3 className="font-sora text-base sm:text-[17px] font-bold leading-snug text-gray-900 dark:text-white line-clamp-3 sm:line-clamp-2 group-hover:text-brand transition-colors">
          {story.title}
        </h3>
        {story.excerpt && (
          <p className="mt-1.5 hidden text-sm leading-relaxed text-gray-600 dark:text-gray-400 font-jakarta line-clamp-2 sm:block">{story.excerpt}</p>
        )}
        <div className="mt-2 sm:mt-auto sm:pt-4"><Byline story={story} /></div>
      </div>
    </Link>
  );
}
