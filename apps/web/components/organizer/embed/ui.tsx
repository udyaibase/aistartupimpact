import type { WidgetStatus } from "@/lib/embed/widgets";

export const card = "bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-[14px]";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-[#A50F15] hover:bg-[#8C0D12] text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#A50F15] disabled:opacity-50 disabled:cursor-not-allowed";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#A50F15] disabled:opacity-50 disabled:cursor-not-allowed";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15]";
export const input =
  "w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:border-[#A50F15] focus:ring-2 focus:ring-[#A50F15]/20";

const STATUS: Record<WidgetStatus, { label: string; dot: string; cls: string }> = {
  live: { label: "Live", dot: "bg-green-600", cls: "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  testing: { label: "Testing on localhost", dot: "bg-sky-600", cls: "bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" },
  waiting: { label: "Waiting for install", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300" },
  stale: { label: "Not detected yet", dot: "bg-amber-600", cls: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300" },
  paused: { label: "Paused", dot: "bg-gray-500", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

export function StatusPill({ status, host }: { status: WidgetStatus; host?: string | null }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${s.cls}`}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status === "live" && host ? `Live on ${host}` : s.label}
    </span>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function displayHost(host: string | null | undefined): string {
  return (host || "").replace(/^www\./, "");
}
