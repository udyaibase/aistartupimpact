'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Clock, Loader2, MessageCircle, Search, Send } from 'lucide-react';
import { HELP_ARTICLES } from '@/lib/support/help-articles';
import { SUPPORT_KINDS, WORKING_HOURS_TEXT } from '@/lib/support/reply-times';

const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const label = 'block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1';

/**
 * Help: search the common questions first; if that doesn't answer it, "Report a problem" sends a ticket with the page
 * they came from, so we don't have to ask. Shows this plan's reply-time promise and our working hours.
 */
export default function HelpCenter({ planName, promise, context: given, whatsapp, initialTopic }: {
  planName: string; promise: { normal: string; urgent: string }; context: { page: string | null; jobId: string | null }; whatsapp: string | null; initialTopic: string | null;
}) {
  const [context, setContext] = useState(given);
  // Came here from the menu: use the portal page they were on (same site only).
  useEffect(() => {
    if (given.page) return;
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (!r || r.origin !== window.location.origin || !r.pathname.startsWith('/employer') || r.pathname.startsWith('/employer/help')) return;
      const page = `${r.pathname}${r.search}`.slice(0, 200);
      const jobId = page.match(/\/employer\/jobs\/([a-z0-9]{20,30})/)?.[1] ?? page.match(/[?&]job=([a-z0-9]{20,30})/)?.[1] ?? null;
      setContext({ page, jobId });
    } catch { /* no referrer: nothing to add */ }
  }, [given.page]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(initialTopic);
  const [form, setForm] = useState({ kind: '', subject: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ number: string; id: string; promise: string; dueAt: string | null } | null>(null);
  const formRef = useRef<HTMLHeadingElement>(null);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return HELP_ARTICLES;
    return HELP_ARTICLES.filter((a) => {
      const hay = `${a.title} ${a.keywords} ${a.body.join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q]);
  const kind = SUPPORT_KINDS.find((k) => k.key === form.kind);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.kind) { setError('Choose what it’s about.'); return; }
    if (form.subject.trim().length < 3) { setError('Add a short title.'); return; }
    if (form.description.trim().length < 10) { setError('Tell us a little more: what you did, and what happened.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/employer/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, context: { page: context.page ?? undefined, jobId: context.jobId ?? undefined } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Couldn’t send. Try again.'); return; }
      setSent({ number: data.ticket.ticketNumber, id: data.ticket.id, promise: data.promise, dueAt: data.dueAt });
      setForm({ kind: '', subject: '', description: '' });
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="font-jakarta max-w-3xl space-y-6">
      <div>
        <h1 className="portal-title">Help</h1>
        <p className="portal-subtitle">Answers to common questions, or tell us what went wrong.</p>
      </div>

      <section aria-labelledby="faq-h" className="space-y-3">
        <h2 id="faq-h" className="sr-only">Common questions</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <label htmlFor="help-q" className="sr-only">Search help</label>
          <input id="help-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. “job waiting” or “import”" className={`${input} pl-9`} />
        </div>
        <p className="sr-only" aria-live="polite">{q ? `${results.length} answers` : ''}</p>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-[14px] bg-white dark:bg-gray-900">
          {results.map((a) => (
            <li key={a.slug}>
              <details open={open === a.slug} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpen(a.slug); }}>
                <summary className="cursor-pointer list-none flex items-center gap-2 px-4 min-h-[48px] text-sm font-semibold text-gray-900 dark:text-white">
                  <span className="flex-1">{a.title}</span><ArrowRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                </summary>
                <div className="px-4 pb-4 space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {a.body.map((p, i) => <p key={i}>{p}</p>)}
                  {a.link && <Link href={a.link.href} className="inline-flex font-semibold text-brand hover:underline">{a.link.label}</Link>}
                </div>
              </details>
            </li>
          ))}
          {results.length === 0 && <li className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">No answer for that. Tell us below and we’ll help.</li>}
        </ul>
      </section>

      <section aria-labelledby="report-h" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-6 space-y-4">
        <div>
          <h2 id="report-h" ref={formRef} tabIndex={-1} className="portal-section-title">Report a problem or ask us</h2>
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4 mt-px shrink-0" aria-hidden />
            <span>{planName} plan: {kind?.urgent ? promise.urgent : promise.normal} Our hours: {WORKING_HOURS_TEXT}.</span>
          </p>
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400 hover:underline">
              <MessageCircle className="w-4 h-4" aria-hidden /> Message us on WhatsApp
            </a>
          )}
        </div>

        {sent ? (
          <div role="status" className="p-4 rounded-[10px] bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-sm text-green-900 dark:text-green-200 space-y-2">
            <p className="font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" aria-hidden /> Sent. Your ticket is {sent.number}.</p>
            <p>{sent.promise}{sent.dueAt ? ` That’s by ${new Date(sent.dueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: 'numeric', minute: '2-digit' })} IST.` : ''} We’ve emailed you a copy.</p>
            <div className="flex gap-4">
              <Link href={`/employer/support/${sent.id}`} className="font-semibold underline">See your ticket</Link>
              <button type="button" onClick={() => setSent(null)} className="font-semibold underline">Report something else</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <div>
              <label htmlFor="sup-kind" className={label}>What’s it about?</label>
              <select id="sup-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={input}>
                <option value="">Choose one</option>
                {SUPPORT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sup-subject" className={label}>Short title</label>
              <input id="sup-subject" value={form.subject} maxLength={200} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={input} placeholder="e.g. Publish button shows an error" />
            </div>
            <div>
              <label htmlFor="sup-desc" className={label}>What happened?</label>
              <textarea id="sup-desc" rows={5} value={form.description} maxLength={5000} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={`${input} py-2`} placeholder="What you were doing, what you expected, and what happened instead." aria-describedby="sup-ctx" />
              <p id="sup-ctx" className="mt-1 text-xs text-gray-500">
                {context.page ? <>We’ll include the page you came from ({context.page.split('?')[0]}){context.jobId ? ' and the job' : ''}, your plan and your browser, so you don’t have to.</> : 'We’ll include your plan and browser, so you don’t have to.'}
              </p>
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send
              </button>
              <Link href="/employer/support" className="text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">Your tickets</Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
