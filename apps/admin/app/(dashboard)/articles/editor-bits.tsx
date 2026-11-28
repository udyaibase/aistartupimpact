'use client';



export const PUBLISHER_ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];

/** The types staff write. Founder stories and startup updates come from the founder portal, so they aren't offered. */
export const TYPES = ['NEWS', 'STORY', 'OPINION', 'GUIDE', 'COMPARISON', 'REPORT', 'TOOL_REVIEW', 'SPONSORED'];
export { TYPE_LABEL } from './article-types';

export const AUTOSAVE_MS = 30_000;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export const LIVE = ['PUBLISHED', 'SCHEDULED'];

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

export const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** ISO time ↔ the browser's local time in a datetime-local input (the editor's own time zone, e.g. IST). */
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}
      className={`w-10 h-6 rounded-full relative transition-colors disabled:opacity-40 ${value ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}`}>
      <span className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all ${value ? 'left-5' : 'left-1'}`} />
    </button>
  );
}

export const editorClasses = `min-h-[500px] focus:outline-none font-jakarta text-[18px] text-charcoal dark:text-gray-200 leading-[1.8] selection:bg-brand/20
  [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-200 dark:[&:empty]:before:text-gray-700 [&:empty]:before:pointer-events-none
  [&_h2]:font-sora [&_h2]:font-bold [&_h2]:text-[28px] [&_h2]:text-navy dark:[&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:leading-tight
  [&_h3]:font-sora [&_h3]:font-bold [&_h3]:text-[22px] [&_h3]:text-navy dark:[&_h3]:text-white [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:leading-tight
  [&_blockquote]:border-l-4 [&_blockquote]:border-brand [&_blockquote]:pl-5 [&_blockquote]:py-2 [&_blockquote]:my-6 [&_blockquote]:italic [&_blockquote]:text-gray-500 dark:[&_blockquote]:text-gray-400 [&_blockquote]:text-xl
  [&_a]:text-brand [&_a]:no-underline hover:[&_a]:underline [&_a.link-underline]:underline [&_a]:decoration-brand/40 [&_a]:underline-offset-2 [&_a_u]:no-underline
  [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ul]:space-y-1
  [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_ol]:space-y-1
  [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-800 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:text-sm [&_pre]:font-mono [&_pre]:text-brand [&_pre]:my-4 [&_pre]:overflow-x-auto
  [&_code]:bg-gray-100 dark:[&_code]:bg-gray-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-brand
  [&_hr]:my-8 [&_hr]:border-gray-200 dark:[&_hr]:border-gray-700
  [&_figure]:my-6 [&_figcaption]:text-center [&_figcaption]:!text-[13px] [&_figcaption]:leading-snug [&_figcaption]:text-gray-500 dark:[&_figcaption]:text-gray-400 [&_figcaption]:mt-2 [&_figcaption]:min-h-[1.25rem]
  [&_figcaption:empty]:before:content-['Add_a_caption_or_image_credit…'] [&_figcaption:empty]:before:text-gray-400
  [&_img]:cursor-pointer [&_img[alt='']]:outline [&_img[alt='']]:outline-2 [&_img[alt='']]:outline-dashed [&_img[alt='']]:outline-amber-400 [&_img:not([alt])]:outline [&_img:not([alt])]:outline-2 [&_img:not([alt])]:outline-dashed [&_img:not([alt])]:outline-amber-400
  [&_img]:rounded-xl [&_img]:w-full [&_p]:mb-4 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic
  [&_.mention]:bg-brand/10 [&_.mention]:text-brand [&_.mention]:font-semibold [&_.mention]:no-underline [&_.mention]:px-1 [&_.mention]:py-0.5 [&_.mention]:rounded [&_.mention]:text-[16px] [&_.mention]:cursor-default`;

export const sideLabel = 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta';

export const seoInput = 'w-full px-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 focus:border-brand focus:ring-1 focus:ring-brand rounded-xl text-sm font-jakarta text-navy dark:text-white outline-none transition-all';

export const seoLabel = 'text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between font-jakarta';
