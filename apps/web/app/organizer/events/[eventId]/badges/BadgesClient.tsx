'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';

const LAYOUTS = [
  { value: 'a4', label: 'A4 sheet', hint: '8 badges per page. Print on card stock and cut along the guides.' },
  { value: 'label', label: '4 × 3 inch label', hint: 'One per label, for label and badge printers.' },
  { value: 'a6', label: 'A6 card', hint: 'One per page, for lanyard pouches.' },
];
const WHO = [
  { value: 'confirmed', label: 'Everyone coming', hint: 'Confirmed and already checked in.' },
  { value: 'checked_in', label: 'Checked in only' },
];

function Choice({ name, options, value, onChange }: { name: string; options: { value: string; label: string; hint?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <label key={o.value} className={`flex items-start gap-3 p-3 rounded-[12px] border cursor-pointer ${value === o.value ? 'border-gray-900 dark:border-white' : 'border-gray-200 dark:border-gray-800'}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5" />
          <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">{o.label}</span>{o.hint && <span className="block text-xs text-gray-500 mt-0.5">{o.hint}</span>}</span>
        </label>
      ))}
    </div>
  );
}

export default function BadgesClient({ eventId }: { eventId: string }) {
  const [layout, setLayout] = useState('a4');
  const [who, setWho] = useState('confirmed');
  const href = `/api/organizer/events/${eventId}/badges?layout=${layout}&who=${who}`;
  return (
    <div className="font-jakarta max-w-2xl">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/organizer/events" aria-label="Back to events" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div><h1 className="portal-title">Badges</h1><p className="portal-subtitle">Name, company, ticket type and the check-in QR code on every badge.</p></div>
      </div>
      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5 space-y-5">
        <div><h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Size</h2><Choice name="layout" options={LAYOUTS} value={layout} onChange={setLayout} /></div>
        <div><h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Who</h2><Choice name="who" options={WHO} value={who} onChange={setWho} /></div>
        <a href={href} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">
          <Download className="w-4 h-4" aria-hidden /> Download PDF
        </a>
        <p className="text-xs text-gray-500">To print one badge as people arrive, use Print badge on the Check-in page after scanning.</p>
      </section>
    </div>
  );
}
