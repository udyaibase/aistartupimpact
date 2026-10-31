"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** "Embed on website" from an event: find or create that event's widget, then open its setup. */
export default function EventWidgetRedirect({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/organizer/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forEventId: eventId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) router.replace(`/organizer/embed/${d.data.id}`);
        else setError(d.error || "Couldn't set up a widget for this event.");
      })
      .catch(() => !cancelled && setError("You seem to be offline. Check your connection and try again."));
    return () => { cancelled = true; };
  }, [eventId, router]);

  return (
    <div className="max-w-lg mx-auto mt-16 text-center font-jakarta" role="status" aria-live="polite">
      {error ? (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-300">{error}</p>
          <Link href="/organizer/embed" className="inline-flex mt-4 min-h-[44px] items-center px-4 rounded-[10px] bg-[#A50F15] text-white text-sm font-semibold hover:bg-[#8C0D12]">
            Go to website widget
          </Link>
        </>
      ) : (
        <p className="text-sm text-gray-500">Preparing your event widget…</p>
      )}
    </div>
  );
}
