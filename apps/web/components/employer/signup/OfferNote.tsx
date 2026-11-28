'use client';

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';

interface Offer { headline: string; placesLeft: number | null; endsAt: string }

/** The running sign-up offer, if there is one: what you get, how many places are left and when it ends. */
export default function OfferNote() {
  const [offer, setOffer] = useState<Offer | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/offers/employer').then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.offer) setOffer(j.offer); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!offer) return null;
  const ends = new Date(offer.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  const left = offer.placesLeft == null ? null : `${offer.placesLeft.toLocaleString('en-IN')} place${offer.placesLeft === 1 ? '' : 's'} left`;
  return (
    <div role="status" className="mb-4 lg:mb-6 flex items-start gap-3 rounded-xl bg-white/15 ring-1 ring-white/25 px-4 py-3 text-white">
      <Gift className="w-5 h-5 mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-jakarta font-semibold text-sm leading-snug">{offer.headline}</p>
        <p className="font-jakarta text-xs text-white/80 mt-0.5">{[left, `Ends ${ends}`, 'No card needed'].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );
}
