/** The "Sponsored" label shown wherever a paid article appears: on its page and on every card that links to it. */
export default function SponsoredTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 ${className}`}>
      Sponsored
    </span>
  );
}
