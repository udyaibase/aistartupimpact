'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Award, CheckCircle2, ExternalLink, Eye, ImagePlus, Loader2, Lock, Mail, MessageSquareText, Plus, Send, Star, Trash2, Upload, Users, X } from 'lucide-react';
import { payWithRazorpay } from '@/lib/billing/checkout-client';
import CertificatePreview from './CertificatePreview';
import ImageDropField from '@/components/ui/ImageDropField';
import { CERTIFICATE_MARKERS, certificatePrompt, checkCustomSvg } from '@/lib/events/certificate-custom';

type Template = 'classic' | 'modern' | 'minimal' | 'executive' | 'heritage' | 'tech' | 'custom';
type Phrase = 'participated' | 'attended' | 'completed' | 'spoke' | 'volunteered';
type CertSettings = { template: Template; audience: 'CHECKED_IN' | 'REGISTERED'; title: string; signerName: string; signerTitle: string; signatureUrl: string | null; autoIssue: boolean; phrase: Phrase; description: string; skills: string[]; duration: string; logoUrl: string | null; partnerLogoUrl: string | null; logoPosition: 'center' | 'left' | 'right'; logoSize: 'small' | 'medium' | 'large'; showHostName: boolean; customSvg: string; logoHeight: number | null; logoOffsetX: number; logoOffsetY: number; logoPlate: boolean };
type FollowSettings = { auto: boolean; includeMissed: boolean; attendedSubject: string; attendedBody: string; missedSubject: string; missedBody: string };
type FeedbackSettings = { enabled: boolean; questions: string[] };
type RecapLink = { kind: 'recording' | 'slides' | 'other'; title: string; url: string };
type Session = { id: string; dayNumber: number; startTime: string; title: string; recordingUrl: string | null; slidesUrl: string | null };
type Recap = { summary: string; links: RecapLink[]; gallery: string[]; galleryLimit: number; sessions: Session[] };
type Feedback = {
  settings: FeedbackSettings; responses: number; averageRating: number | null; nps: number | null; distribution: number[]; responseRate: number | null;
  comments: { rating: number; comment: string; at: string }[]; answers: { question: string; answers: string[] }[];
};
type Data = {
  event: { id: string; slug: string; title: string; startAt: string; endAt: string; started: boolean; ended: boolean };
  counts: { registered: number; attended: number; missed: number; optedOut: number };
  sources: { label: string; count: number }[];
  certificates: { allowed: boolean; paid: boolean; pricePaise: number; issued: number; configured: boolean; settings: CertSettings; sample?: { hostName: string; logoUrl: string | null; dateLine: string } };
  recap: Recap;
  feedback: Feedback;
  followUp: { settings: FollowSettings; left: number | null; autoSentAt: string | null; history: { id: string; status: string; sentAt: string; recipients: number }[] };
};

const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1.5';
const primary = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';

function Card({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-6">
      <h2 className="portal-section-title flex items-center gap-2">{icon}{title}</h2>
      {hint && <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-1">{hint}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Toggle({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
      <span className="text-sm text-gray-800 dark:text-gray-200">{children}</span>
    </label>
  );
}

const TEMPLATES: { id: Template; name: string; swatch: string; dark?: boolean }[] = [
  { id: 'classic', name: 'Classic', swatch: 'bg-[#FDFAF4] border-[#B08C3D] border-[3px] [outline:1px_solid_#B08C3D] [outline-offset:-7px]' },
  { id: 'modern', name: 'Modern', swatch: 'bg-white border-l-[6px] border-l-[#DB2645] border-t-[3px] border-t-gray-900' },
  { id: 'minimal', name: 'Minimal', swatch: 'bg-white border border-gray-300' },
  { id: 'executive', name: 'Executive', swatch: 'bg-[#0D182E] border-[#D4B05C] border-2 [outline:1px_solid_#D4B05C] [outline-offset:-6px]', dark: true },
  { id: 'heritage', name: 'Heritage', swatch: 'bg-[#FCF9F2] border-[#851C26] border-[3px] [outline:1px_solid_#B8943F] [outline-offset:-7px]' },
  { id: 'tech', name: 'Tech', swatch: 'bg-white border-t-[14px] border-t-[#0F172A] border-b-[3px] border-b-[#0D9488]' },
  { id: 'custom', name: 'Custom', swatch: 'bg-gray-50 border-2 border-dashed border-gray-400' },
];

const LOGO_HEIGHTS = { small: 38, medium: 56, large: 74 } as const;
/** "12 pt left", "centred"… for the fine position sliders. */
const offsetText = (n: number, minus: string, plus: string) => (n === 0 ? 'as placed' : `${Math.abs(n)} pt ${n < 0 ? minus : plus}`);

const PHRASES: { id: Phrase; text: string }[] = [
  { id: 'participated', text: 'participated in' },
  { id: 'attended', text: 'attended' },
  { id: 'completed', text: 'successfully completed' },
  { id: 'spoke', text: 'spoke at' },
  { id: 'volunteered', text: 'volunteered at' },
];

export default function AfterEventClient({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cert, setCert] = useState<CertSettings | null>(null);
  // The topics are typed as one line with commas; the server turns them into the list (up to 6).
  const [skillsText, setSkillsText] = useState<string | null>(null);
  const [follow, setFollow] = useState<FollowSettings | null>(null);
  const [fb, setFb] = useState<FeedbackSettings | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState<'' | 'cert' | 'follow' | 'feedback' | 'recap'>('');
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'issue' | 'send' | 'buy' | 'upload' | 'photos'>('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/after-event`);
      const d = await r.json();
      if (!r.ok || !d.success) { setLoadError(d.error || 'Couldn’t load this event.'); return; }
      setData(d);
      setCert((c) => c ?? { phrase: 'participated', description: '', skills: [], duration: '', logoUrl: null, partnerLogoUrl: null, logoPosition: 'center', logoSize: 'medium', showHostName: false, customSvg: '', logoHeight: null, logoOffsetX: 0, logoOffsetY: 0, logoPlate: true, ...d.certificates.settings });
      setSkillsText((t) => t ?? (d.certificates.settings.skills ?? []).join(', '));
      setFollow((f) => f ?? d.followUp.settings);
      setFb((f) => f ?? d.feedback.settings);
      setRecap((r) => r ?? d.recap);
    } catch {
      setLoadError('You seem to be offline.');
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const flash = (kind: 'ok' | 'error', text: string) => { setNote({ kind, text }); if (kind === 'ok') setTimeout(() => setNote(null), 5000); };

  async function save(which: 'cert' | 'follow' | 'feedback' | 'recap') {
    setSaving(which);
    const body = which === 'cert' ? { certificateSettings: { ...cert, skills: skillsText ?? '' } }
      : which === 'follow' ? { followUpSettings: follow }
      : which === 'feedback' ? { feedbackSettings: fb }
      : { recap: recap && { summary: recap.summary, links: recap.links.filter((l) => l.url.trim()), gallery: recap.gallery, sessions: recap.sessions } };
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/after-event`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) flash('error', d.error || 'Couldn’t save.');
      else {
        flash('ok', { cert: 'Certificate design saved.', follow: 'Follow-up saved.', feedback: 'Feedback settings saved.', recap: 'Recap saved. It’s on your event page.' }[which]);
        if (which === 'recap') setRecap(null);
        load();
      }
    } catch { flash('error', 'You seem to be offline.'); }
    finally { setSaving(''); }
  }

  async function issue() {
    setBusy('issue');
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/certificates`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) flash('error', d.error || 'Couldn’t issue certificates.');
      else { flash('ok', d.issued ? `Issued ${d.issued} certificate${d.issued === 1 ? '' : 's'}.` : 'Everyone eligible already has a certificate.'); load(); }
    } catch { flash('error', 'You seem to be offline.'); }
    finally { setBusy(''); }
  }

  async function send() {
    setConfirmSend(false);
    setBusy('send');
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/follow-up`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) flash('error', d.error || 'Couldn’t send the follow-up.');
      else { flash('ok', `Sent to ${d.sent} ${d.sent === 1 ? 'person' : 'people'}.`); load(); }
    } catch { flash('error', 'You seem to be offline.'); }
    finally { setBusy(''); }
  }

  async function buy() {
    setBusy('buy');
    try {
      const r = await fetch('/api/organizer/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'CERTIFICATES', eventId }) });
      const d = await r.json().catch(() => ({}));
      if (d.code === 'BILLING_REQUIRED') { flash('error', 'Add your invoice details on the Billing page first, then come back.'); return; }
      if (!r.ok) { flash('error', d.error || 'Couldn’t start the payment.'); return; }
      const out = await payWithRazorpay(d, '/api/organizer/billing/verify');
      if (out.ok) { flash('ok', 'Certificates are on for this event.'); load(); }
      else if (!out.cancelled) flash('error', out.error);
    } catch { flash('error', 'You seem to be offline.'); }
    finally { setBusy(''); }
  }

  async function uploadImage(file: File, field: 'signatureUrl' | 'logoUrl' | 'partnerLogoUrl' = 'signatureUrl') {
    setBusy('upload');
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await fetch('/api/organizer/upload', { method: 'POST', body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) flash('error', d.error || 'Upload failed.');
      else setCert((c) => (c ? { ...c, [field]: d.url } : c));
    } catch { flash('error', 'You seem to be offline.'); }
    finally { setBusy(''); }
  }

  async function uploadPhotos(files: FileList) {
    if (!recap) return;
    const room = recap.galleryLimit - recap.gallery.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (!list.length) { flash('error', `Your plan allows ${recap.galleryLimit} photos per event.`); return; }
    setBusy('photos');
    const added: string[] = [];
    for (const file of list) {
      try {
        const body = new FormData();
        body.append('file', file);
        const r = await fetch('/api/organizer/upload', { method: 'POST', body });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.url) added.push(d.url);
        else { flash('error', d.error || `Couldn’t upload ${file.name}.`); break; }
      } catch { flash('error', 'You seem to be offline.'); break; }
    }
    setRecap((rc) => (rc ? { ...rc, gallery: [...rc.gallery, ...added].slice(0, rc.galleryLimit) } : rc));
    setBusy('');
    if (photoRef.current) photoRef.current.value = '';
    if (added.length) flash('ok', `Added ${added.length} photo${added.length === 1 ? '' : 's'}. Save the recap to publish them.`);
  }

  if (loadError) return <div className="p-6 text-sm text-red-700">{loadError}</div>;
  if (!data || !cert || !follow || !fb || !recap) {
    return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…</div>;
  }

  const { counts, certificates, followUp, event, feedback } = data;
  const rate = counts.registered ? Math.round((counts.attended / counts.registered) * 100) : 0;
  const recipients = counts.attended + (follow.includeMissed ? counts.missed : 0) - counts.optedOut;
  // What every preview on this screen shows: the large live one and the small one on each design choice.
  const previewProps = cert && data ? {
    title: cert.title,
    phrase: PHRASES.find((x) => x.id === (cert.phrase ?? 'participated'))?.text ?? 'participated in',
    description: cert.description ?? '',
    skills: (skillsText ?? '').split(','),
    dateLine: [data.certificates.sample?.dateLine, (cert.duration ?? '').trim()].filter(Boolean).join(' · '),
    eventTitle: data.event.title,
    hostName: data.certificates.sample?.hostName ?? '',
    logoUrl: cert.logoUrl ?? data.certificates.sample?.logoUrl ?? null,
    partnerLogoUrl: cert.partnerLogoUrl,
    logoPosition: cert.logoPosition ?? 'center',
    logoSize: cert.logoSize ?? 'medium',
    logoHeight: cert.logoHeight ?? null,
    logoOffsetX: cert.logoOffsetX ?? 0,
    logoOffsetY: cert.logoOffsetY ?? 0,
    logoPlate: cert.logoPlate !== false,
    showHostName: !!cert.showHostName,
    customSvg: cert.customSvg ?? '',
    duration: cert.duration ?? '',
    signerName: cert.signerName,
    signerTitle: cert.signerTitle,
    signatureUrl: cert.signatureUrl,
    sampleName: 'Priya Sharma',
  } as const : null;
  const logoHeightNow = cert ? cert.logoHeight ?? LOGO_HEIGHTS[cert.logoSize ?? 'medium'] : 56;
  const previewHref = `/api/organizer/events/${eventId}/certificates/preview?settings=${encodeURIComponent(JSON.stringify({ ...cert, customSvg: undefined, skills: skillsText ?? '' }))}`;
  const eligible = cert.audience === 'CHECKED_IN' ? counts.attended : counts.registered;

  return (
    <div className="font-jakarta max-w-4xl">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/organizer/events" aria-label="Back to events" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
          <ArrowLeft className="w-5 h-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="portal-title">After the event</h1>
          <p className="portal-subtitle truncate">{event.title}</p>
        </div>
      </div>

      {note && (
        <div role={note.kind === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-2 p-3 rounded-[12px] border text-sm ${note.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-900 dark:bg-green-900/20 dark:border-green-900/40 dark:text-green-200' : 'border-red-200 bg-red-50 text-red-900 dark:bg-red-900/20 dark:border-red-900/40 dark:text-red-200'}`}>
          <span className="flex-1">{note.text}</span>
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}

      {!event.started && (
        <p className="mb-4 p-3 rounded-[12px] border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/40 text-sm text-blue-900 dark:text-blue-200">
          The event hasn’t started yet. Set up your follow-up and certificates now; you can send and issue them once it starts.
        </p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          ['Registered', counts.registered],
          ['Checked in', counts.attended],
          ['Didn’t attend', counts.missed],
          ['Attendance', `${rate}%`],
        ].map(([k, v]) => (
          <div key={k as string} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{k}</p>
            <p className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-white">{v}</p>
          </div>
        ))}
      </div>

      {data.sources.length > 0 && (
        <div className="mb-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Where registrations came from</p>
          <ul className="space-y-1.5">
            {data.sources.map((src) => (
              <li key={src.label} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">{src.label}</span>
                <span className="w-24 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"><span className="block h-full bg-gray-900 dark:bg-white" style={{ width: `${counts.registered ? (src.count / counts.registered) * 100 : 0}%` }} /></span>
                <span className="w-8 text-right font-semibold text-gray-900 dark:text-white">{src.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        {/* Follow-up emails */}
        <Card icon={<Mail className="w-4 h-4" aria-hidden />} title="Follow-up emails"
          hint={<>People who checked in get the thank-you; people who registered but didn’t come get the second message. Use <code>{'{name}'}</code> and <code>{'{event}'}</code>. {followUp.left === null ? 'Unlimited on Pro.' : followUp.left > 0 ? 'Your free plan includes 1 follow-up per event.' : 'You’ve used this event’s free follow-up.'}</>}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">To people who checked in ({counts.attended})</p>
            <div>
              <label htmlFor="fu-a-subject" className="sr-only">Subject</label>
              <input id="fu-a-subject" value={follow.attendedSubject} maxLength={150} onChange={(e) => setFollow({ ...follow, attendedSubject: e.target.value })} className={input} placeholder="Subject" />
            </div>
            <div>
              <label htmlFor="fu-a-body" className="sr-only">Message</label>
              <textarea id="fu-a-body" value={follow.attendedBody} maxLength={3000} rows={6} onChange={(e) => setFollow({ ...follow, attendedBody: e.target.value })} className={`${input} py-2.5 resize-y`} />
            </div>
            {certificates.issued > 0 && <p className="text-[13px] text-gray-600 dark:text-gray-400">Each attendee’s email includes a “Get your certificate” button.</p>}
          </div>

          <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Toggle id="fu-missed" checked={follow.includeMissed} onChange={(v) => setFollow({ ...follow, includeMissed: v })}>
              <span className="font-semibold">Also email people who didn’t attend ({counts.missed})</span>
            </Toggle>
            {follow.includeMissed && (
              <>
                <input aria-label="Subject for people who didn’t attend" value={follow.missedSubject} maxLength={150} onChange={(e) => setFollow({ ...follow, missedSubject: e.target.value })} className={input} />
                <textarea aria-label="Message for people who didn’t attend" value={follow.missedBody} maxLength={3000} rows={5} onChange={(e) => setFollow({ ...follow, missedBody: e.target.value })} className={`${input} py-2.5 resize-y`} />
              </>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
            <Toggle id="fu-auto" checked={follow.auto} onChange={(v) => setFollow({ ...follow, auto: v })}>
              Send automatically 2 hours after the event ends {followUp.autoSentAt && <span className="text-gray-500">(sent {new Date(followUp.autoSentAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })})</span>}
            </Toggle>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={() => save('follow')} disabled={saving === 'follow'} className={secondary}>
                {saving === 'follow' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save
              </button>
              {!confirmSend ? (
                <button type="button" onClick={() => setConfirmSend(true)} disabled={!event.started || busy === 'send' || followUp.left === 0 || recipients <= 0} className={primary}>
                  {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send now
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 p-2 rounded-[10px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <span className="text-sm text-amber-900 dark:text-amber-200 px-1">Send to {recipients} {recipients === 1 ? 'person' : 'people'}? Save your edits first.</span>
                  <button type="button" onClick={send} className={primary}>Send</button>
                  <button type="button" onClick={() => setConfirmSend(false)} className="min-h-[40px] px-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Cancel</button>
                </div>
              )}
            </div>
            {counts.optedOut > 0 && <p className="text-[13px] text-gray-500 dark:text-gray-400">{counts.optedOut} {counts.optedOut === 1 ? 'person has' : 'people have'} asked not to get your emails; they’re skipped.</p>}
            {followUp.history.length > 0 && (
              <ul className="text-[13px] text-gray-600 dark:text-gray-400 space-y-1">
                {followUp.history.map((h) => (
                  <li key={h.id} className="flex items-center gap-1.5">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${h.status === 'SENT' ? 'text-green-600' : 'text-gray-400'}`} aria-hidden />
                    {h.status === 'SENT' ? `Sent to ${h.recipients}` : h.status === 'FAILED' ? 'Failed' : 'Sending'} · {new Date(h.sentAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Certificates */}
        <Card icon={<Award className="w-4 h-4" aria-hidden />} title="Certificates"
          hint="A PDF with each person’s name, your logo and signature, and a QR code anyone can scan to check it’s genuine. Attendees can add it to LinkedIn in one click.">
          {!certificates.allowed && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
              <Lock className="hidden sm:block w-5 h-5 text-gray-500 shrink-0" aria-hidden />
              <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                Certificates are included in <strong>Pro</strong>, or you can add them to this event for <strong>₹{(certificates.pricePaise / 100).toLocaleString('en-IN')} + GST</strong>. Design and preview them for free.
              </p>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={buy} disabled={busy === 'buy'} className={primary}>
                  {busy === 'buy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Add for this event
                </button>
                <Link href="/organizer/billing" className={secondary}>See Pro</Link>
              </div>
            </div>
          )}

          <fieldset>
            <legend className={label}>Design</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {TEMPLATES.map((t) => (
                <label key={t.id} className={`cursor-pointer rounded-[12px] border p-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${cert.template === t.id ? 'border-brand bg-brand/5' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'}`}>
                  <input type="radio" name="cert-template" value={t.id} checked={cert.template === t.id} onChange={() => setCert({ ...cert, template: t.id })} className="sr-only" />
                  {/* The design itself, small, with this event's own details: not a stand-in pattern. */}
                  <span className="block aspect-[842/595] rounded-[6px] overflow-hidden border border-gray-200 dark:border-gray-700 bg-white" aria-hidden>
                    {t.id === 'custom' && !(cert.customSvg ?? '').trim() ? (
                      <span className="flex h-full flex-col items-center justify-center gap-0.5 border-2 border-dashed border-gray-300 rounded-[6px] bg-gray-50 text-gray-500">
                        <span className="text-[15px] leading-none font-mono">&lt;/&gt;</span>
                        <span className="text-[9px] font-semibold">Paste your code</span>
                      </span>
                    ) : previewProps ? <CertificatePreview {...previewProps} template={t.id} /> : null}
                  </span>
                  <span className="mt-1.5 block text-center text-[13px] font-semibold text-gray-800 dark:text-gray-200">{t.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Follows every change below as it is typed. Stays in view on wider screens while the host fills the form. */}
          <div className="md:sticky md:top-0 z-10 -mx-1 px-1 py-2 bg-white dark:bg-gray-900">
            <div className="mx-auto max-w-[460px]">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Live preview</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Updates as you type. The name is an example.</p>
              </div>
              <div className="rounded-[8px] overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
{previewProps && <CertificatePreview {...previewProps} template={cert.template} />}
              </div>
            </div>
          </div>

          {cert.template === 'custom' && (() => {
            const problems = checkCustomSvg(cert.customSvg ?? '');
            return (
              <div className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="cert-custom-svg" className="text-sm font-semibold text-gray-900 dark:text-white">Custom design (SVG code)</label>
                  <button type="button" className={secondary}
                    onClick={async () => { try { await navigator.clipboard.writeText(certificatePrompt(event.title)); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { flash('error', 'Couldn’t copy. Select the text in “What to ask” below instead.'); } }}>
                    {copied ? 'Copied' : 'Copy prompt for Claude or ChatGPT'}
                  </button>
                </div>
                <p className="text-[13px] text-gray-600 dark:text-gray-400">
                  Paste the prompt into Claude or ChatGPT, then paste the SVG it gives you here. A design exported as SVG from Figma, Canva or Illustrator works too. The name, event and other details below are filled into its markers for each attendee.
                </p>
                <textarea id="cert-custom-svg" value={cert.customSvg ?? ''} onChange={(e) => setCert({ ...cert, customSvg: e.target.value })} rows={8} spellCheck={false}
                  placeholder={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 842 595">\n  …\n  <text x="421" y="300" text-anchor="middle">{{name}}</text>\n</svg>'}
                  aria-describedby="cert-custom-problems" aria-invalid={problems.some((x) => x.level === 'error') && !!cert.customSvg}
                  className="w-full px-3 py-2 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[12px] leading-5 font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/40" />
                <ul id="cert-custom-problems" className="space-y-1" aria-live="polite">
                  {problems.map((x) => (
                    <li key={x.message} className={`text-[13px] ${x.level === 'error' ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-300'}`}>
                      <strong>{x.level === 'error' ? 'Fix: ' : 'Note: '}</strong>{x.message}
                    </li>
                  ))}
                  {problems.length === 0 && <li className="text-[13px] text-green-700 dark:text-green-400">This design is ready. Check the preview, then save.</li>}
                </ul>
                <details className="text-[13px] text-gray-700 dark:text-gray-300">
                  <summary className="cursor-pointer font-semibold min-h-[32px] inline-flex items-center">Markers you can use</summary>
                  <dl className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1">
                    {Object.entries(CERTIFICATE_MARKERS).map(([key, what]) => (
                      <div key={key} className="flex gap-2"><dt className="font-mono text-[12px] shrink-0">{`{{${key}}}`}</dt><dd className="text-gray-500 dark:text-gray-400">{what}</dd></div>
                    ))}
                  </dl>
                  <p className="mt-2 text-gray-500 dark:text-gray-400">The QR code, certificate ID and verify address are always added by Udyaibase, so every certificate can be checked. Scripts, animations and links to other websites are removed.</p>
                </details>
                <details className="text-[13px] text-gray-700 dark:text-gray-300">
                  <summary className="cursor-pointer font-semibold min-h-[32px] inline-flex items-center">What to ask Claude or ChatGPT</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-[8px] bg-gray-50 dark:bg-gray-800 p-3 text-[12px] leading-5 select-all">{certificatePrompt(event.title)}</pre>
                </details>
              </div>
            );
          })()}

          <fieldset className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-white">Logo</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <ImageDropField label="Your logo" value={cert.logoUrl} busy={busy === 'upload'} cropTitle="Crop your logo"
                onPick={(file) => uploadImage(file, 'logoUrl')} onRemove={() => setCert({ ...cert, logoUrl: null })}
                hint={cert.logoUrl ? undefined : 'Without one, your profile picture is used if you have it; otherwise your organization’s name is printed.'} />
              <ImageDropField label="Partner logo (optional)" value={cert.partnerLogoUrl} busy={busy === 'upload'} cropTitle="Crop the partner logo"
                onPick={(file) => uploadImage(file, 'partnerLogoUrl')} onRemove={() => setCert({ ...cert, partnerLogoUrl: null })}
                hint="A sponsor, partner or accrediting body, shown beside yours." />
            </div>

            <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <fieldset>
                <legend className={label}>Position</legend>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Logo position">
                  {([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] as const).map(([value, name]) => {
                    const on = (cert.logoPosition ?? 'center') === value;
                    return (
                      <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setCert({ ...cert, logoPosition: value })}
                        className={`min-h-[44px] rounded-[10px] border px-2 py-1.5 flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${on ? 'border-brand bg-brand/5 text-brand' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-400'}`}>
                        {/* A tiny page with a block where the logo sits. */}
                        <span aria-hidden className={`flex w-9 h-[18px] rounded-[3px] border border-current p-[2px] ${value === 'left' ? 'justify-start' : value === 'right' ? 'justify-end' : 'justify-center'}`}><span className="block w-2.5 h-1.5 rounded-[1px] bg-current" /></span>
                        {name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="cert-logo-height" className={label}>Size</label>
                  <span className="text-xs text-gray-500 tabular-nums">{logoHeightNow} pt</span>
                </div>
                <input id="cert-logo-height" type="range" min={24} max={74} step={1} value={logoHeightNow} onChange={(e) => setCert({ ...cert, logoHeight: Number(e.target.value) })} className="w-full h-11 accent-[#A50F15]" />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="cert-logo-x" className={label}>Move left or right</label>
                  <span className="text-xs text-gray-500 tabular-nums">{offsetText(cert.logoOffsetX ?? 0, 'left', 'right')}</span>
                </div>
                <input id="cert-logo-x" type="range" min={-140} max={140} step={2} value={cert.logoOffsetX ?? 0} onChange={(e) => setCert({ ...cert, logoOffsetX: Number(e.target.value) })} className="w-full h-11 accent-[#A50F15]" />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="cert-logo-y" className={label}>Move up or down</label>
                  <span className="text-xs text-gray-500 tabular-nums">{offsetText(cert.logoOffsetY ?? 0, 'up', 'down')}</span>
                </div>
                <input id="cert-logo-y" type="range" min={-40} max={40} step={1} value={cert.logoOffsetY ?? 0} onChange={(e) => setCert({ ...cert, logoOffsetY: Number(e.target.value) })} className="w-full h-11 accent-[#A50F15]" />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Toggle id="cert-show-host" checked={!!cert.showHostName} onChange={(v) => setCert({ ...cert, showHostName: v })}>Also print your organization’s name</Toggle>
              <Toggle id="cert-logo-plate" checked={cert.logoPlate !== false} onChange={(v) => setCert({ ...cert, logoPlate: v })}>White background behind the logo on dark designs</Toggle>
              {(cert.logoHeight !== null || (cert.logoOffsetX ?? 0) !== 0 || (cert.logoOffsetY ?? 0) !== 0 || (cert.logoPosition ?? 'center') !== 'center') && (
                <button type="button" onClick={() => setCert({ ...cert, logoHeight: null, logoOffsetX: 0, logoOffsetY: 0, logoPosition: 'center' })} className="ml-auto text-sm font-semibold text-gray-600 dark:text-gray-300 hover:underline min-h-[32px]">Reset position and size</button>
              )}
            </div>
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cert-title" className={label}>Certificate title</label>
              <input id="cert-title" value={cert.title} maxLength={60} onChange={(e) => setCert({ ...cert, title: e.target.value })} className={input} />
            </div>
            <fieldset>
              <legend className={label}>Who gets one</legend>
              <div className="flex flex-col gap-2">
                <Toggle id="aud-checked" checked={cert.audience === 'CHECKED_IN'} onChange={() => setCert({ ...cert, audience: 'CHECKED_IN' })}>People who checked in ({counts.attended})</Toggle>
                <Toggle id="aud-all" checked={cert.audience === 'REGISTERED'} onChange={() => setCert({ ...cert, audience: 'REGISTERED' })}>Everyone who registered ({counts.registered})</Toggle>
              </div>
            </fieldset>
            <div>
              <label htmlFor="cert-phrase" className={label}>Wording</label>
              <select id="cert-phrase" value={cert.phrase ?? 'participated'} onChange={(e) => setCert({ ...cert, phrase: e.target.value as Phrase })} className={input}>
                {PHRASES.map((p) => <option key={p.id} value={p.id}>[Name] {p.text} [event]</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cert-duration" className={label}>Duration <span className="font-normal text-gray-500">(optional)</span></label>
              <input id="cert-duration" value={cert.duration ?? ''} maxLength={24} onChange={(e) => setCert({ ...cert, duration: e.target.value })} className={input} placeholder="e.g. 6 hours, 2 days" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cert-description" className={label}>About the event <span className="font-normal text-gray-500">(optional, one sentence)</span></label>
              <input id="cert-description" value={cert.description ?? ''} maxLength={160} onChange={(e) => setCert({ ...cert, description: e.target.value })} className={input} placeholder="e.g. A hands-on day of building and shipping AI agents." aria-describedby="cert-description-count" />
              <p id="cert-description-count" className="mt-1 text-xs text-gray-500">{(cert.description ?? '').length}/160. Printed under the date.</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cert-skills" className={label}>Topics covered <span className="font-normal text-gray-500">(optional)</span></label>
              <input id="cert-skills" value={skillsText ?? ''} onChange={(e) => setSkillsText(e.target.value)} className={input} placeholder="e.g. Prompt design, RAG pipelines, Evaluation" aria-describedby="cert-skills-help" />
              <p id="cert-skills-help" className="mt-1 text-xs text-gray-500">What people learned or worked on. Separate with commas; up to 6, printed as “Topics covered”.</p>
            </div>
            <div>
              <label htmlFor="cert-signer" className={label}>Signed by</label>
              <input id="cert-signer" value={cert.signerName} maxLength={80} onChange={(e) => setCert({ ...cert, signerName: e.target.value })} className={input} placeholder="e.g. Priya Sharma" />
            </div>
            <div>
              <label htmlFor="cert-signer-title" className={label}>Their title</label>
              <input id="cert-signer-title" value={cert.signerTitle} maxLength={80} onChange={(e) => setCert({ ...cert, signerTitle: e.target.value })} className={input} placeholder="e.g. Founder, Bengaluru AI Club" />
            </div>
          </div>

          <div className="sm:max-w-[50%]">
            <ImageDropField label="Signature (optional)" value={cert.signatureUrl} busy={busy === 'upload'} cropTitle="Crop the signature" removeWhiteByDefault
              onPick={(file) => uploadImage(file, 'signatureUrl')} onRemove={() => setCert({ ...cert, signatureUrl: null })}
              hint="A photo of a signature on white paper works: the white is made see-through when you crop it." />
          </div>

          <Toggle id="cert-auto" checked={cert.autoIssue} onChange={(v) => setCert({ ...cert, autoIssue: v })}>
            Issue automatically when someone checks in
          </Toggle>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <a href={previewHref} target="_blank" rel="noopener" className={secondary}><Eye className="w-4 h-4" aria-hidden /> Preview PDF</a>
            <button type="button" onClick={() => save('cert')} disabled={saving === 'cert'} className={secondary}>
              {saving === 'cert' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save design
            </button>
            <button type="button" onClick={issue} disabled={!certificates.allowed || !certificates.configured || !event.started || busy === 'issue' || eligible === 0} className={primary}
              title={!certificates.configured ? 'Save the design first' : undefined}>
              {busy === 'issue' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Users className="w-4 h-4" aria-hidden />} Issue certificates ({eligible})
            </button>
          </div>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">
            {certificates.issued > 0 ? `${certificates.issued} issued so far. ` : ''}Issue them before you send the follow-up, so the thank-you email includes each person’s certificate.
          </p>
        </Card>

        {/* Feedback */}
        <Card icon={<MessageSquareText className="w-4 h-4" aria-hidden />} title="Feedback"
          hint="The thank-you email asks attendees to rate the event in one tap, then answer a couple of short questions. No sign-in needed.">
          <Toggle id="fb-on" checked={fb.enabled} onChange={(v) => setFb({ ...fb, enabled: v })}>Ask attendees for feedback</Toggle>
          {fb.enabled && (
            <div className="space-y-2">
              <p className={label}>Your questions <span className="font-normal text-gray-500">(optional, up to 3)</span></p>
              {fb.questions.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <input aria-label={`Question ${i + 1}`} value={q} maxLength={150} onChange={(e) => setFb({ ...fb, questions: fb.questions.map((x, j) => (j === i ? e.target.value : x)) })} className={input} />
                  <button type="button" onClick={() => setFb({ ...fb, questions: fb.questions.filter((_, j) => j !== i) })} aria-label={`Remove question ${i + 1}`} className="w-11 shrink-0 inline-flex items-center justify-center rounded-[10px] text-gray-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
                </div>
              ))}
              {fb.questions.length < 3 && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setFb({ ...fb, questions: [...fb.questions, ''] })} className={secondary}><Plus className="w-4 h-4" aria-hidden /> Add a question</button>
                  {['What did you like most?', 'What should we improve?', 'What topics should we cover next?'].filter((x) => !fb.questions.includes(x)).slice(0, 2).map((x) => (
                    <button key={x} type="button" onClick={() => setFb({ ...fb, questions: [...fb.questions, x] })} className="min-h-[40px] px-3 rounded-[10px] border border-dashed border-gray-300 dark:border-gray-700 text-[13px] text-gray-700 dark:text-gray-300 hover:border-brand hover:text-brand">+ {x}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div><button type="button" onClick={() => save('feedback')} disabled={saving === 'feedback'} className={secondary}>{saving === 'feedback' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save</button></div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            {feedback.responses === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">No responses yet. They appear here as people answer.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-xs text-gray-500">Average rating</p><p className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-white inline-flex items-center gap-1">{feedback.averageRating?.toFixed(1)} <Star className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden /></p></div>
                  <div><p className="text-xs text-gray-500">Recommendation score</p><p className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-white">{feedback.nps === null ? '–' : `${feedback.nps > 0 ? '+' : ''}${feedback.nps}`}</p><p className="mt-0.5 text-[11px] leading-snug text-gray-500">From −100 to +100: people who’d recommend it (9–10) minus those who wouldn’t (0–6).</p></div>
                  <div><p className="text-xs text-gray-500">Responses</p><p className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-white">{feedback.responses}{feedback.responseRate !== null ? <span className="text-sm font-normal text-gray-500"> · {feedback.responseRate}%</span> : null}</p></div>
                </div>
                <div className="space-y-1">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const c = feedback.distribution[n - 1] ?? 0;
                    return (
                      <div key={n} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="w-6">{n}★</span>
                        <span className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"><span className="block h-full bg-amber-400" style={{ width: `${feedback.responses ? (c / feedback.responses) * 100 : 0}%` }} /></span>
                        <span className="w-6 text-right">{c}</span>
                      </div>
                    );
                  })}
                </div>
                {feedback.answers.filter((a) => a.answers.length).map((a) => (
                  <details key={a.question} className="rounded-[10px] border border-gray-200 dark:border-gray-800 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">{a.question} <span className="font-normal text-gray-500">({a.answers.length})</span></summary>
                    <ul className="mt-2 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">{a.answers.map((x, i) => <li key={i}>“{x}”</li>)}</ul>
                  </details>
                ))}
                {feedback.comments.length > 0 && (
                  <details className="rounded-[10px] border border-gray-200 dark:border-gray-800 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">Comments <span className="font-normal text-gray-500">({feedback.comments.length})</span></summary>
                    <ul className="mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-300">{feedback.comments.map((c, i) => <li key={i}><span className="text-amber-500">{'★'.repeat(c.rating)}</span> “{c.comment}”</li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Recap */}
        <Card icon={<ImagePlus className="w-4 h-4" aria-hidden />} title="Recap"
          hint={<>After the event ends, your event page shows a recap: highlights, photos, recordings and slides, and how many came (no names). <Link href={`/events/${event.slug}`} target="_blank" className="inline-flex items-center gap-0.5 font-semibold text-brand">View page <ExternalLink className="w-3 h-3" aria-hidden /></Link></>}>
          <div>
            <label htmlFor="recap-summary" className={label}>Highlights <span className="font-normal text-gray-500">(optional)</span></label>
            <textarea id="recap-summary" rows={3} maxLength={1000} value={recap.summary} onChange={(e) => setRecap({ ...recap, summary: e.target.value })} className={`${input} py-2.5 resize-y`} placeholder="What happened, in a few lines" />
          </div>

          <div>
            <p className={label}>Photos <span className="font-normal text-gray-500">({recap.gallery.length}/{recap.galleryLimit}{recap.galleryLimit < 50 ? ' on Free; 50 on Pro' : ''})</span></p>
            {recap.gallery.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
                {recap.gallery.map((src, i) => (
                  <div key={src} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setRecap({ ...recap, gallery: recap.gallery.filter((x) => x !== src) })} aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-1 right-1 w-7 h-7 inline-flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><X className="w-4 h-4" aria-hidden /></button>
                  </div>
                ))}
              </div>
            )}
            <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadPhotos(e.target.files); }} />
            <button type="button" onClick={() => photoRef.current?.click()} disabled={busy === 'photos' || recap.gallery.length >= recap.galleryLimit} className={secondary}>
              {busy === 'photos' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ImagePlus className="w-4 h-4" aria-hidden />} Add photos
            </button>
          </div>

          <div>
            <p className={label}>Recordings and slides</p>
            <div className="space-y-2">
              {recap.links.map((l, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr] sm:grid-cols-[120px_1fr_1.4fr_44px] gap-2">
                  <select aria-label="Type" value={l.kind} onChange={(e) => setRecap({ ...recap, links: recap.links.map((x, j) => (j === i ? { ...x, kind: e.target.value as RecapLink['kind'] } : x)) })} className={input}>
                    <option value="recording">Recording</option><option value="slides">Slides</option><option value="other">Other</option>
                  </select>
                  <input aria-label="Title" value={l.title} maxLength={100} placeholder="Title" onChange={(e) => setRecap({ ...recap, links: recap.links.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className={input} />
                  <input aria-label="Link" type="url" value={l.url} placeholder="https://youtube.com/…" onChange={(e) => setRecap({ ...recap, links: recap.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className={`${input} col-span-2 sm:col-span-1`} />
                  <button type="button" onClick={() => setRecap({ ...recap, links: recap.links.filter((_, j) => j !== i) })} aria-label="Remove link" className="hidden sm:inline-flex items-center justify-center rounded-[10px] text-gray-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
                </div>
              ))}
            </div>
            {recap.links.length < 10 && (
              <button type="button" onClick={() => setRecap({ ...recap, links: [...recap.links, { kind: 'recording', title: '', url: '' }] })} className={`${secondary} mt-2`}><Plus className="w-4 h-4" aria-hidden /> Add a link</button>
            )}
            <p className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">A YouTube recording plays right on the page. Drive, Vimeo and slide links open in a new tab.</p>
          </div>

          {recap.sessions.length > 0 && (
            <details className="rounded-[10px] border border-gray-200 dark:border-gray-800 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">Per-session recordings and slides ({recap.sessions.length} sessions)</summary>
              <div className="mt-3 space-y-3">
                {recap.sessions.map((sess, i) => (
                  <div key={sess.id}>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{sess.startTime} · {sess.title}</p>
                    <div className="mt-1 grid sm:grid-cols-2 gap-2">
                      <input aria-label={`Recording for ${sess.title}`} type="url" placeholder="Recording link" value={sess.recordingUrl ?? ''} onChange={(e) => setRecap({ ...recap, sessions: recap.sessions.map((x, j) => (j === i ? { ...x, recordingUrl: e.target.value || null } : x)) })} className={input} />
                      <input aria-label={`Slides for ${sess.title}`} type="url" placeholder="Slides link" value={sess.slidesUrl ?? ''} onChange={(e) => setRecap({ ...recap, sessions: recap.sessions.map((x, j) => (j === i ? { ...x, slidesUrl: e.target.value || null } : x)) })} className={input} />
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div><button type="button" onClick={() => save('recap')} disabled={saving === 'recap'} className={primary}>{saving === 'recap' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save recap</button></div>
        </Card>
      </div>
    </div>
  );
}
