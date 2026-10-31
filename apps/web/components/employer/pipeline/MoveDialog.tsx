'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mail, X } from 'lucide-react';

export interface Template { subject: string; body: string; sendByDefault: boolean }

const STAGE_LABEL: Record<string, string> = {
  REVIEWED: 'New', SHORTLISTED: 'Shortlisted', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
};

export interface MoveRequest {
  ids: string[];
  toStatus: string;
  /** Single candidate's first name, for the preview line. */
  name?: string;
}

/** Confirm a stage move and edit the email the candidate(s) will get. */
export default function MoveDialog({
  request, template, bookingUrl, onCancel, onConfirm,
}: {
  request: MoveRequest;
  template?: Template;
  bookingUrl: string | null;
  onCancel: () => void;
  onConfirm: (opts: { email: { subject: string; body: string; sendAt: string | null } | null; bookingUrl?: string }) => Promise<void>;
}) {
  const n = request.ids.length;
  const [send, setSend] = useState(template?.sendByDefault ?? false);
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [booking, setBooking] = useState(bookingUrl ?? '');
  const [when, setWhen] = useState<'now' | 'morning'>('now');
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  const isInterview = request.toStatus === 'INTERVIEW';
  const canSchedule = request.toStatus === 'REJECTED' || n > 1;

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  async function confirm() {
    setBusy(true);
    const sendAt = when === 'morning' ? nextMorningIstIso() : null;
    await onConfirm({
      email: template && send ? { subject, body, sendAt } : null,
      bookingUrl: isInterview && booking.trim() ? booking.trim() : undefined,
    });
    setBusy(false);
  }

  const who = n === 1 ? request.name ?? 'this candidate' : `${n} candidates`;
  const verb = request.toStatus === 'REJECTED' ? 'Reject' : `Move to ${STAGE_LABEL[request.toStatus]}`;
  const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="move-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onCancel()} aria-hidden />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-[20px] sm:rounded-[14px] shadow-xl font-jakarta">
        <div className="flex items-center gap-3 px-5 pt-5">
          <h2 id="move-title" className="flex-1 portal-section-title">{verb}: {who}</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="px-5 pb-5 pt-3 space-y-4">
          {template ? (
            <>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#A50F15]" />
                <span>
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">Email {n === 1 ? 'the candidate' : 'each candidate'}</span>
                  <span className="block text-[13px] text-gray-600 dark:text-gray-400">Replies come to your email. {'{{firstName}}'}, {'{{jobTitle}}'}{isInterview ? <> and {'{{bookingLink}}'}</> : null} are filled in for each person.</span>
                </span>
              </label>
              {send && (
                <div className="space-y-3">
                  {isInterview && (
                    <div>
                      <label htmlFor="mv-booking" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Interview booking link <span className="font-normal text-gray-500">(optional)</span></label>
                      <input id="mv-booking" type="url" inputMode="url" value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="https://calendly.com/you/30min" className={input} />
                      <p className="mt-1 text-xs text-gray-500">Calendly, Cal.com or Google Calendar booking page. Saved for next time. Without one, the email says you’ll be in touch to find a time.</p>
                    </div>
                  )}
                  <div>
                    <label htmlFor="mv-subject" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Subject</label>
                    <input id="mv-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={input} />
                  </div>
                  <div>
                    <label htmlFor="mv-body" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Message</label>
                    <textarea id="mv-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={5000} className={`${input} py-2.5 resize-y leading-relaxed`} />
                  </div>
                  {canSchedule && (
                    <fieldset>
                      <legend className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Send</legend>
                      <div className="flex flex-wrap gap-2">
                        {([['now', 'Now'], ['morning', 'Tomorrow, 10:00 AM IST']] as const).map(([v, l]) => (
                          <label key={v} className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-[10px] border text-sm cursor-pointer ${when === v ? 'border-[#A50F15] bg-[#A50F15]/5 text-[#A50F15] font-semibold' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                            <input type="radio" name="mv-when" value={v} checked={when === v} onChange={() => setWhen(v)} className="sr-only" /> {l}
                          </label>
                        ))}
                      </div>
                      {request.toStatus === 'REJECTED' && <p className="mt-1.5 text-xs text-gray-500">Many teams send rejections the next morning rather than late at night.</p>}
                    </fieldset>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">No email is sent for this move.</p>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <button ref={firstRef} type="button" onClick={onCancel} disabled={busy} className="min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={confirm} disabled={busy || (send && (!subject.trim() || !body.trim()))}
            className={`inline-flex items-center gap-2 min-h-[44px] px-5 rounded-[10px] text-sm font-semibold text-white disabled:opacity-60 ${request.toStatus === 'REJECTED' ? 'bg-red-700 hover:bg-red-800' : 'bg-[#A50F15] hover:bg-[#8C0D12]'}`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : send && template ? <Mail className="w-4 h-4" aria-hidden /> : null}
            {verb}{send && template ? (when === 'morning' ? ' and schedule email' : ' and send email') : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function nextMorningIstIso(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 10, 0) - 5.5 * 3600_000).toISOString();
}
