'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Share2, Check, X, Copy, MessageCircle, Send, MoreHorizontal } from 'lucide-react';

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  iconOnly?: boolean;
  /** A rounded 44px pill, for action bars. */
  pill?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  image?: string;
}

/** Copy text, giving up after a second (some embedded browsers never answer the clipboard request). */
async function copyText(text: string) {
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
    ]);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

/**
 * Share. On phones and tablets it opens the device's own share sheet. On computers it opens a small menu: copy the
 * link (with a "Copied" confirmation), the main networks, and the system share when the browser has one.
 */
export default function ShareButton({ title, text, url, iconOnly = false, pill = false, size = 'md', className = '', image }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(url || '');

  useEffect(() => { if (!url) setShareUrl(window.location.href); }, [url]);
  const shareText = text || title;

  const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: shareText, url: shareUrl || window.location.href });
      return 'done' as const;
    } catch (e: any) {
      return e?.name === 'AbortError' ? ('cancelled' as const) : ('failed' as const);
    }
  };

  const handleShare = async () => {
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && canNativeShare()) {
      // The reader closed the share sheet on purpose: leave it there.
      if ((await nativeShare()) !== 'failed') return;
    }
    setOpen(true);
  };

  const handleCopy = async () => {
    const ok = await copyText(shareUrl || window.location.href);
    setCopyFailed(!ok);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);
  useEffect(() => { if (!open) { setCopied(false); setCopyFailed(false); } }, [open]);

  const enc = encodeURIComponent;
  const networks = [
    { label: 'X', bg: 'bg-black', icon: <span className="text-white text-sm font-bold">𝕏</span>, href: `https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(shareUrl)}` },
    { label: 'LinkedIn', bg: 'bg-[#0077B5]', icon: <span className="text-white text-sm font-bold">in</span>, href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl)}` },
    { label: 'WhatsApp', bg: 'bg-[#25D366]', icon: <MessageCircle className="w-5 h-5 text-white" aria-hidden />, href: `https://wa.me/?text=${enc(`${shareText} ${shareUrl}`)}` },
    { label: 'Facebook', bg: 'bg-[#1877F2]', icon: <span className="text-white text-sm font-bold">f</span>, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}` },
    { label: 'Telegram', bg: 'bg-[#0088cc]', icon: <Send className="w-[18px] h-[18px] text-white" aria-hidden />, href: `https://t.me/share/url?url=${enc(shareUrl)}&text=${enc(shareText)}` },
  ];

  const sizeClasses = { sm: 'w-7 h-7 rounded-lg', md: 'w-9 h-9 rounded-xl', lg: 'w-11 h-11 rounded-lg' };
  const iconSizes = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-5 h-5' };

  const button = pill ? (
    <button type="button" onClick={handleShare} aria-haspopup="dialog"
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-4 font-jakarta text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${className}`}>
      <Share2 className="h-[18px] w-[18px]" aria-hidden /> Share
    </button>
  ) : iconOnly ? (
    <button type="button" onClick={handleShare} aria-label="Share" title="Share" aria-haspopup="dialog"
      className={`${sizeClasses[size]} border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all ${className}`}>
      <Share2 className={iconSizes[size]} aria-hidden />
    </button>
  ) : (
    <button type="button" onClick={handleShare} title="Share" aria-haspopup="dialog"
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-brand hover:text-brand transition-all text-sm font-semibold font-jakarta shadow-sm hover:shadow-md ${className}`}>
      <Share2 className="w-4 h-4" aria-hidden /> Share
    </button>
  );

  return (
    <>
      {button}

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/50 animate-fade-in" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="share-sheet-title" onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-[20px] sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-none font-jakarta pb-[calc(env(safe-area-inset-bottom)+12px)] sm:pb-0">
            <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" aria-hidden />
            <div className="flex items-center justify-between pl-5 pr-2 pt-2 sm:pt-3">
              <h2 id="share-sheet-title" className="text-base font-bold text-gray-900 dark:text-white font-sora">Share</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="px-5 pb-5">
              <div className="flex items-center gap-3 rounded-[12px] border border-gray-200 dark:border-gray-700 p-3">
                {image && <Image src={image} alt="" width={48} height={48} sizes="48px" className="h-12 w-12 rounded-[8px] object-cover" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{title}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500 select-all">{shareUrl}</p>
                </div>
              </div>

              <button type="button" onClick={handleCopy}
                className={`mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] text-sm font-semibold transition-colors ${copied
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'}`}>
                {copied ? <><Check className="h-4 w-4" aria-hidden /> Link copied</> : <><Copy className="h-4 w-4" aria-hidden /> Copy link</>}
              </button>
              <p role="status" className="sr-only">{copied ? 'Link copied' : ''}</p>
              {copyFailed && (
                <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">Couldn&apos;t copy automatically. Select the link above and copy it.</p>
              )}

              <div className="mt-4 grid grid-cols-5 gap-1">
                {networks.map((n) => (
                  <a key={n.label} href={n.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-[12px] py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full ${n.bg}`}>{n.icon}</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">{n.label}</span>
                  </a>
                ))}
              </div>

              {canNativeShare() && (
                <button type="button" onClick={async () => { if ((await nativeShare()) === 'done') setOpen(false); }}
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <MoreHorizontal className="h-4 w-4" aria-hidden /> More options
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
