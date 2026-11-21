import Image from 'next/image';
import { initials } from './storyMeta';

/**
 * A story's picture. When a story has none, a designed cover takes its place (dark, a soft brand glow, the topic
 * and the startup's logo or initials) so cards stay even and nothing looks broken. Same look in light and dark.
 */
export default function StoryCover({
  src, title, topic, logo, name, sizes, priority = false, className = '', compact = false, thumbOnPhone = false,
}: {
  src?: string | null;
  title: string;
  topic?: string;
  logo?: string | null;
  name?: string | null;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Smaller type for small thumbnails. */
  compact?: boolean;
  /** A small square thumbnail on phones, the full cover from the sm breakpoint up. */
  thumbOnPhone?: boolean;
}) {
  if (src) {
    return (
      <div className={`relative overflow-hidden bg-gray-100 dark:bg-gray-800 ${className}`}>
        <Image src={src} alt={title} fill sizes={sizes} priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
    );
  }
  // Thumbnail-on-phone: the pieces that need room only appear from the sm breakpoint.
  const t = thumbOnPhone;
  return (
    <div aria-hidden className={`relative overflow-hidden bg-[linear-gradient(135deg,#17171a_0%,#0b0b0c_55%,#000_100%)] text-white dark:ring-1 dark:ring-inset dark:ring-white/10 ${className}`}>
      <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand/40 blur-3xl" />
      <span className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom_left,black,transparent_70%)]" />
      <span className={`absolute font-sora font-extrabold leading-none text-white/10 ${compact ? 'right-2 bottom-0 text-5xl' : t ? 'right-1.5 bottom-0 text-5xl sm:right-4 sm:text-[120px]' : 'right-4 bottom-0 text-[120px]'}`}>&rdquo;</span>
      {!compact && topic && (
        <span className={`absolute left-4 top-4 text-xs font-bold uppercase tracking-[0.16em] text-white/60 font-jakarta ${t ? 'hidden sm:block' : ''}`}>{topic}</span>
      )}
      {(logo || name) && <span className={`absolute flex items-center gap-2 ${compact ? 'left-2.5 bottom-2.5' : t ? 'inset-0 justify-center sm:inset-auto sm:left-4 sm:bottom-4' : 'left-4 bottom-4'}`}>
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white/10 ring-1 ring-inset ring-white/15 font-sora font-bold ${compact ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'}`}>
          {logo
            ? <Image src={logo} alt="" width={40} height={40} sizes="40px" className="h-full w-full object-cover" />
            : initials(name)}
        </span>
        {!compact && name && <span className={`max-w-[12rem] truncate text-[13px] font-semibold text-white/80 font-jakarta ${t ? 'hidden sm:inline' : ''}`}>{name}</span>}
      </span>}
    </div>
  );
}
