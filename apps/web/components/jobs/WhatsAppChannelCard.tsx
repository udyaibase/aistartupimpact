import { WhatsAppIcon } from '@/components/ui/BrandIcons';
import { channelHref, type ChannelSource } from '@/lib/whatsapp-channel';

/**
 * "New AI jobs on WhatsApp": a join link to the Udyaibase jobs channel. Render it only when the channel is set
 * (getSeoConfig().socialWhatsappChannel), and only on Udyaibase pages, never on a company's own careers page or widget.
 * 'card' is the full prompt; 'inline' is one line for sidebars and alert boxes.
 */
export default function WhatsAppChannelCard({ from, variant = 'card' }: { from: ChannelSource; variant?: 'card' | 'inline' }) {
  const href = channelHref(from);
  if (variant === 'inline') {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 min-h-[40px] text-sm font-semibold font-jakarta text-gray-800 dark:text-gray-200 hover:text-[#15803D] dark:hover:text-[#4ADE80]">
        <WhatsAppIcon className="w-5 h-5 text-[#25D366]" />
        Get new AI jobs on WhatsApp
        <span className="sr-only"> (opens WhatsApp in a new tab)</span>
      </a>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#25D366]/40 bg-[#25D366]/[0.06] dark:bg-[#25D366]/[0.08] p-4 font-jakarta text-left">
      <span className="w-10 h-10 rounded-full bg-[#25D366] grid place-items-center shrink-0" aria-hidden>
        <WhatsAppIcon className="w-6 h-6 text-white" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">New AI jobs, every day on WhatsApp</span>
        <span className="block text-xs text-gray-600 dark:text-gray-400">Join our channel. Your number stays private.</span>
      </span>
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-[10px] bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold shrink-0">
        Join<span className="sr-only"> the Udyaibase jobs channel on WhatsApp (opens in a new tab)</span>
      </a>
    </div>
  );
}
