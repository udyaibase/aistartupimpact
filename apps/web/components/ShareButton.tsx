'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Share2, Check, X, Copy, ExternalLink, MessageCircle, Send } from 'lucide-react';

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  iconOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  image?: string;
}

export default function ShareButton({ title, text, url, iconOnly = false, size = 'md', className = '', image }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = text || title;

  const handleShare = async () => {
    // Try native Web Share API (mobile)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
        return;
      } catch {
        // user cancelled — show modal instead
      }
    }
    // Desktop: show share modal
    setShowModal(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  };

  const shareTwitter = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  const shareLinkedIn = () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
  const shareWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank');
  const shareFacebook = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
  const shareTelegram = () => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank');

  const sizeClasses = { sm: 'w-7 h-7 rounded-lg', md: 'w-9 h-9 rounded-xl', lg: 'w-11 h-11 rounded-lg' };
  const iconSizes = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-5 h-5' };

  const button = iconOnly ? (
    <div className="relative group">
      <button onClick={handleShare} className={`${sizeClasses[size]} border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all ${className}`}>
        {copied ? <Check className={`${iconSizes[size]} text-green-500`} /> : <Share2 className={iconSizes[size]} />}
      </button>
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:flex flex-col items-center z-dropdown">
        <div className="w-2.5 h-2.5 bg-black dark:bg-gray-800 rotate-45 -mb-1.5" />
        <div className="bg-black dark:bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg font-jakarta">{copied ? 'Copied!' : 'Share'}</div>
      </div>
    </div>
  ) : (
    <button onClick={handleShare} title="Share" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-brand hover:text-brand transition-all text-sm font-semibold font-jakarta shadow-sm hover:shadow-md">
      {copied ? <><Check className="w-4 h-4 text-green-500" /><span className="text-green-500">Copied!</span></> : <><Share2 className="w-4 h-4" />Share</>}
    </button>
  );

  return (
    <>
      {button}

      {/* Share Modal */}
      {showModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-800 dark:text-white font-sora">Share</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-400"/></button>
            </div>

            {/* Preview Card */}
            <div className="px-5 py-4">
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-4">
                {image && <Image src={image} alt="" className="w-full h-32 object-cover" width={400} height={128} sizes="(max-width: 768px) 100vw, 50vw" />}
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white font-jakarta line-clamp-1">{title}</p>
                  <p className="text-xs text-gray-400 font-jakarta mt-0.5 truncate">{shareUrl}</p>
                </div>
              </div>

              {/* Copy Link */}
              <div className="flex items-center gap-2 mb-4">
                <input type="text" readOnly value={shareUrl} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 font-jakarta font-mono truncate"/>
                <button onClick={handleCopy} className="px-3 py-2 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0">
                  {copied ? <><Check className="w-3 h-3"/> Copied</> : <><Copy className="w-3 h-3"/> Copy</>}
                </button>
              </div>

              {/* Social Share Buttons */}
              <div className="grid grid-cols-5 gap-2">
                <button onClick={shareTwitter} className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center"><span className="text-white text-sm font-bold">𝕏</span></div>
                  <span className="text-xs text-gray-500 font-jakarta">Twitter</span>
                </button>
                <button onClick={shareLinkedIn} className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-[#0077B5] flex items-center justify-center"><span className="text-white text-sm font-bold">in</span></div>
                  <span className="text-xs text-gray-500 font-jakarta">LinkedIn</span>
                </button>
                <button onClick={shareWhatsApp} className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center"><MessageCircle className="w-5 h-5 text-white" aria-hidden /></div>
                  <span className="text-xs text-gray-500 font-jakarta">WhatsApp</span>
                </button>
                <button onClick={shareFacebook} className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center"><span className="text-white text-sm font-bold">f</span></div>
                  <span className="text-xs text-gray-500 font-jakarta">Facebook</span>
                </button>
                <button onClick={shareTelegram} className="flex flex-col items-center gap-1 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-[#0088cc] flex items-center justify-center"><Send className="w-[18px] h-[18px] text-white" aria-hidden /></div>
                  <span className="text-xs text-gray-500 font-jakarta">Telegram</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
