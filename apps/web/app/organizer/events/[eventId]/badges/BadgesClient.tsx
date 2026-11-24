'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ConfirmSheet from '@/components/ui/ConfirmSheet';
import BadgePreview from '@/components/organizer/BadgePreview';
import type { BadgePerson } from '@/lib/events/badge-draw';
import { ArrowLeft, Download, Lock, Check, Loader2, ImagePlus, X, Sparkles, FileCode2, Copy } from 'lucide-react';
import { BADGE_TEMPLATES, BADGE_TEMPLATE_INFO, MAX_BADGE_QUESTIONS, type BadgeQrPosition, type BadgeSettings, type BadgeTemplate } from '@/lib/events/badge-settings';
import { BADGE_DESIGN_SIZES, BADGE_MARKERS, badgePrompt, checkBadgeSvg, type BadgeSvgProblem } from '@/lib/events/badge-custom';

const LAYOUTS = [
  { value: 'a4', label: 'A4 sheet', hint: '8 badges per page. Print on card stock and cut along the guides.' },
  { value: 'label', label: '4 × 3 inch label', hint: 'One per label, for label and badge printers.' },
  { value: 'a6', label: 'A6 card', hint: 'One per page, for lanyard pouches.' },
  { value: 'card', label: 'Credit card size', hint: '85.6 × 54 mm, one per page. For plastic ID-card printers; best for name-only badges.' },
];
const WHO = [
  { value: 'confirmed', label: 'Everyone coming', hint: 'Confirmed and already checked in.' },
  { value: 'checked_in', label: 'Checked in only' },
];
const SWATCHES = ['#FF3131', '#E11D48', '#EA580C', '#CA8A04', '#16A34A', '#0D9488', '#2563EB', '#4F46E5', '#7C3AED', '#111827'];

function Choice({ name, options, value, onChange }: { name: string; options: { value: string; label: string; hint?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <label key={o.value} className={`flex items-start gap-3 p-3 rounded-[12px] border cursor-pointer ${value === o.value ? 'border-gray-900 dark:border-gray-500' : 'border-gray-200 dark:border-gray-800'}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5" />
          <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">{o.label}</span>{o.hint && <span className="block text-xs text-gray-500 mt-0.5">{o.hint}</span>}</span>
        </label>
      ))}
    </div>
  );
}

/** A small drawing of each template, so the choice is visual. */
function Thumb({ t, accent }: { t: BadgeTemplate; accent: string }) {
  const dark = t === 'dark';
  if (t === 'custom') {
    return (
      <div aria-hidden className="relative h-[92px] w-full overflow-hidden rounded-[8px] border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex flex-col items-center justify-center gap-1 text-gray-500">
        <FileCode2 className="w-6 h-6" /><span className="text-[11px] font-semibold">SVG + {'{{name}}'}</span>
      </div>
    );
  }
  return (
    <div aria-hidden className={`relative h-[92px] w-full overflow-hidden rounded-[8px] border ${dark ? 'bg-gray-950 border-gray-600' : 'bg-white border-gray-200'}`}>
      {t === 'bold' && <div className="absolute inset-x-0 top-0 h-5" style={{ background: accent }} />}
      <div className="absolute inset-x-0 top-[26px] flex flex-col items-center gap-1">
        {t === 'minimal' && <div className="h-[2px] w-4 mb-0.5" style={{ background: accent }} />}
        <div className={`h-2 w-14 rounded-sm ${dark ? 'bg-white' : 'bg-gray-800'}`} />
        <div className={`h-1 w-10 rounded-sm ${dark ? 'bg-gray-500' : 'bg-gray-300'}`} />
        {t === 'classic' && <div className="h-[2px] w-5 mt-0.5" style={{ background: accent }} />}
      </div>
      <div className={`absolute left-1/2 -translate-x-1/2 ${t === 'conference' ? 'bottom-[18px]' : 'bottom-2'} h-6 w-6 rounded-[2px] ${dark ? 'bg-white' : 'bg-gray-800'}`} />
      {t === 'conference' && <div className="absolute inset-x-0 bottom-0 h-3.5" style={{ background: accent }} />}
    </div>
  );
}

export default function BadgesClient({ eventId, eventTitle, eventDate, logoUrl, sponsorLogoUrls, pro, initial, tiers, questions, sponsorCount, hasLogo }: {
  eventId: string; eventTitle: string; eventDate: string; logoUrl: string | null; sponsorLogoUrls: string[]; pro: boolean; initial: BadgeSettings;
  tiers: { id: string; name: string }[]; questions: { id: string; label: string }[]; sponsorCount: number; hasLogo: boolean;
}) {
  const [s, setS] = useState<BadgeSettings>(initial);
  const [saved, setSaved] = useState<BadgeSettings>(initial);
  const [layout, setLayout] = useState('a4');
  const [who, setWho] = useState('confirmed');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  const [svgProblems, setSvgProblems] = useState<BadgeSvgProblem[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [promptSize, setPromptSize] = useState<keyof typeof BADGE_DESIGN_SIZES>('a6');
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = (patch: Partial<BadgeSettings>) => { setS((x) => ({ ...x, ...patch })); setMsg(null); };

  // The A4 sheet's badges preview as a single card; the other sizes as themselves.
  const previewLayout = (layout === 'a4' ? 'a6' : layout) as 'a6' | 'label' | 'card';
  // Built-in templates are drawn right here, at once (BadgePreview). A host's own design is cleaned and drawn on the
  // server, from the saved copy (the design is too long for an address; it's saved as soon as it's added).
  const ownDesign = s.template === 'custom';
  const [previewUrl, setPreviewUrl] = useState('');
  const query = useMemo(() => JSON.stringify({ ...s, customSvg: undefined }), [s]);
  useEffect(() => {
    if (!ownDesign) return;
    const t = setTimeout(() => setPreviewUrl(`/api/organizer/events/${eventId}/badges/preview?layout=${previewLayout}&settings=${encodeURIComponent(query)}`), 150);
    return () => clearTimeout(t);
  }, [ownDesign, eventId, query, previewLayout]);
  // The sample person: the event's first ticket type and its own questions, so the preview looks like the real thing.
  const sample = useMemo<BadgePerson>(() => ({
    name: 'Priya Sharma', company: 'Your Startup', occupation: 'Founder', tier: tiers[0]?.name ?? 'General', tierId: tiers[0]?.id ?? null,
    qrToken: 'SAMPLE-BADGE', answers: Object.fromEntries(questions.slice(0, 2).map((q) => [q.id, 'Sample answer'])),
  }), [tiers, questions]);
  const questionLabels = useMemo(() => Object.fromEntries(questions.filter((q) => s.questionIds.includes(q.id)).map((q) => [q.id, q.label])), [questions, s.questionIds]);

  const save = async (next: BadgeSettings = s): Promise<boolean> => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/badges/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setMsg({ ok: false, text: data.error || 'Couldn’t save the design.' }); return false; }
      setS(data.settings); setSaved(data.settings);
      setMsg({ ok: true, text: 'Design saved. Every badge you print now uses it.' });
      return true;
    } catch { setMsg({ ok: false, text: 'You seem to be offline.' }); return false; } finally { setSaving(false); }
  };

  const download = async () => {
    if (dirty && !(await save())) return;
    window.location.href = `/api/organizer/events/${eventId}/badges?layout=${layout}&who=${who}`;
  };

  const uploadBackground = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true); setMsg(null);
    try {
      const body = new FormData(); body.append('file', file);
      const r = await fetch('/api/organizer/upload', { method: 'POST', body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'Couldn’t upload the image.');
      set({ backgroundUrl: d.url });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t upload the image.' }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  /** Check a design and, when it's usable, switch to it and save straight away (so the preview can show it). */
  const applyDesign = async (text: string) => {
    const problems = checkBadgeSvg(text);
    setSvgProblems(problems);
    if (problems.some((p) => p.level === 'error')) return;
    const next = { ...s, customSvg: text, template: 'custom' as const };
    setS(next);
    if (await save(next)) { setPasteOpen(false); setPaste(''); }
  };
  const readSvgFile = async (file: File | undefined) => {
    if (!file) return;
    if (svgRef.current) svgRef.current.value = '';
    if (file.size > 400_000) { setSvgProblems([{ level: 'error', message: 'The file is too large (over 300 KB). Use smaller images inside the design.' }]); return; }
    await applyDesign(await file.text());
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(badgePrompt(eventTitle, promptSize)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the prompt is shown to copy by hand */ }
  };

  const toggleQuestion = (id: string) => {
    const has = s.questionIds.includes(id);
    if (!has && s.questionIds.length >= MAX_BADGE_QUESTIONS) return;
    set({ questionIds: has ? s.questionIds.filter((q) => q !== id) : [...s.questionIds, id] });
  };

  const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5';
  const h2 = 'text-sm font-semibold text-gray-900 dark:text-white';
  const lock = !pro;

  return (
    <div className="font-jakarta max-w-5xl">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/organizer/events" aria-label="Back to events" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div className="min-w-0"><h1 className="portal-title">Badges</h1><p className="portal-subtitle truncate">{eventTitle}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4 min-w-0">
          {/* Design: every host */}
          <section className={card}>
            <h2 className={h2}>Template</h2>
            <div role="radiogroup" aria-label="Badge template" className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {BADGE_TEMPLATES.map((t) => {
                const on = s.template === t;
                const ownLocked = t === 'custom' && lock;
                return (
                  <button key={t} type="button" role="radio" aria-checked={on} aria-disabled={ownLocked || undefined}
                    onClick={() => {
                      if (ownLocked) return;
                      if (t === 'custom' && !s.customSvg) { document.getElementById('own-design')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
                      set({ template: t });
                    }}
                    className={`text-left rounded-[12px] border p-2 transition-colors ${on ? 'border-gray-900 dark:border-gray-500 ring-1 ring-gray-900 dark:ring-gray-500/60' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'}`}>
                    <Thumb t={t} accent={s.accent} />
                    <span className="mt-2 flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">{on && <Check className="w-3.5 h-3.5" aria-hidden />}{BADGE_TEMPLATE_INFO[t].label}{t === 'custom' && <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-1.5 py-px text-[10px] font-bold">{ownLocked && <Lock className="w-2.5 h-2.5" aria-hidden />}Pro</span>}</span>
                    <span className="block text-xs text-gray-500 leading-snug">{BADGE_TEMPLATE_INFO[t].hint}</span>
                  </button>
                );
              })}
            </div>

            <h2 className={`${h2} mt-5`}>QR code position</h2>
            <div role="radiogroup" aria-label="QR code position" className="mt-2 grid grid-cols-4 gap-1 rounded-[12px] bg-gray-100 dark:bg-gray-800 p-1">
              {([['auto', 'Auto'], ['left', 'Left'], ['center', 'Middle'], ['right', 'Right']] as [BadgeQrPosition, string][]).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={s.qrPosition === v} onClick={() => set({ qrPosition: v })}
                  className={`min-h-[40px] rounded-[9px] text-sm font-semibold ${s.qrPosition === v ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}>{label}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">Auto: middle on tall badges, right on wide ones.{s.template === 'custom' ? ' Your own design’s QR box (id="qr") takes priority.' : ''}</p>

            <h2 className={`${h2} mt-5`}>Accent colour</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => set({ accent: c })} aria-label={`Accent ${c}`} aria-pressed={s.accent === c}
                  className={`w-9 h-9 rounded-full border-2 ${s.accent === c ? 'border-gray-900 dark:border-gray-300' : 'border-transparent'}`} style={{ background: c }} />
              ))}
              <label className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-full border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value.toUpperCase() })} className="w-6 h-6 rounded-full border-0 p-0 bg-transparent" aria-label="Custom accent colour" />
                Custom
              </label>
            </div>

            <label className={`mt-5 flex items-center justify-between gap-3 ${hasLogo ? '' : 'opacity-60'}`}>
              <span><span className={`block ${h2}`}>Show your logo</span><span className="block text-xs text-gray-500">{hasLogo ? 'Your organisation logo at the top of each badge.' : <>Add a logo in <Link href="/organizer/settings" className="underline">Settings</Link> first.</>}</span></span>
              <input type="checkbox" checked={s.showLogo && hasLogo} disabled={!hasLogo} onChange={(e) => set({ showLogo: e.target.checked })} className="w-5 h-5" />
            </label>
          </section>

          {/* Custom: Pro */}
          <section className={`${card} relative`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={`${h2} flex items-center gap-2`}>Custom badges <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2 py-0.5 text-[11px] font-bold"><Sparkles className="w-3 h-3" aria-hidden />Pro</span></h2>
              {lock && <Link href="/organizer/billing" className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"><Lock className="w-3.5 h-3.5" aria-hidden />Upgrade to Pro</Link>}
            </div>
            {lock && <p className="mt-1 text-xs text-gray-500">Colour each ticket type, choose what’s printed, add answers, sponsors and your own artwork.</p>}

            <fieldset disabled={lock} className={`mt-4 space-y-5 ${lock ? 'opacity-50 pointer-events-none select-none' : ''}`} aria-describedby={lock ? 'pro-note' : undefined}>
              <div>
                <h3 className={h2}>Ticket type colours</h3>
                {tiers.length ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {tiers.map((t) => (
                      <label key={t.id} className="flex items-center justify-between gap-3 min-h-[44px] px-3 rounded-[10px] border border-gray-200 dark:border-gray-800">
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{t.name}</span>
                        <span className="flex items-center gap-2">
                          {s.tierColors[t.id] && <button type="button" onClick={() => { const n = { ...s.tierColors }; delete n[t.id]; set({ tierColors: n }); }} className="text-xs text-gray-500 underline">Clear</button>}
                          <input type="color" value={s.tierColors[t.id] ?? s.accent} onChange={(e) => set({ tierColors: { ...s.tierColors, [t.id]: e.target.value.toUpperCase() } })} className="w-10 h-10 rounded-[8px] border border-gray-200 p-0" aria-label={`Colour for ${t.name}`} />
                        </span>
                      </label>
                    ))}
                  </div>
                ) : <p className="mt-1 text-xs text-gray-500">This event has no ticket types yet.</p>}
              </div>

              <div>
                <h3 className={h2}>What’s printed</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([['role', 'Role'], ['company', 'Company'], ['tier', 'Ticket type'], ['qr', 'Check-in QR']] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2.5 min-h-[44px] px-3 rounded-[10px] border border-gray-200 dark:border-gray-800 text-sm text-gray-800 dark:text-gray-200">
                      <input type="checkbox" checked={s.fields[k]} onChange={(e) => set({ fields: { ...s.fields, [k]: e.target.checked } })} className="w-4 h-4" />{label}
                    </label>
                  ))}
                </div>
                {!s.fields.qr && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">Without the QR code, badges can’t be scanned at check-in.</p>}
              </div>

              <div>
                <h3 className={h2}>Registration answers <span className="font-normal text-gray-500">(up to {MAX_BADGE_QUESTIONS})</span></h3>
                {questions.length ? (
                  <div className="mt-2 grid gap-2">
                    {questions.map((q) => {
                      const on = s.questionIds.includes(q.id);
                      return (
                        <label key={q.id} className={`flex items-center gap-2.5 min-h-[44px] px-3 rounded-[10px] border text-sm ${on ? 'border-gray-900 dark:border-gray-500' : 'border-gray-200 dark:border-gray-800'} text-gray-800 dark:text-gray-200`}>
                          <input type="checkbox" checked={on} disabled={!on && s.questionIds.length >= MAX_BADGE_QUESTIONS} onChange={() => toggleQuestion(q.id)} className="w-4 h-4" />{q.label}
                        </label>
                      );
                    })}
                  </div>
                ) : <p className="mt-1 text-xs text-gray-500">Add questions to the registration form to print answers like T-shirt size.</p>}
              </div>

              <label className={`flex items-center justify-between gap-3 ${sponsorCount ? '' : 'opacity-60'}`}>
                <span><span className={`block ${h2}`}>Sponsor strip</span><span className="block text-xs text-gray-500">{sponsorCount ? `Up to 4 sponsor logos along the bottom (${sponsorCount} available).` : 'Add sponsors with logos on the Sponsors page first.'}</span></span>
                <input type="checkbox" checked={s.sponsorStrip && !!sponsorCount} disabled={!sponsorCount} onChange={(e) => set({ sponsorStrip: e.target.checked })} className="w-5 h-5" />
              </label>

              <div id="own-design" className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-3 sm:p-4">
                <h3 className={`${h2} flex items-center gap-2`}><FileCode2 className="w-4 h-4" aria-hidden />Your own design</h3>
                <p className="text-xs text-gray-500 mt-0.5">A whole badge designed in Canva, Figma or by an AI tool, exported as SVG. Put these placeholders in it as text; each person’s details are printed there:</p>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {Object.entries(BADGE_MARKERS).map(([k, label]) => (
                    <li key={k} className="text-gray-600 dark:text-gray-400"><code className="font-mono text-[11px] text-gray-900 dark:text-white">{`{{${k}}}`}</code> {label.replace(' (required)', '')}{k === 'name' && <span className="text-red-600"> *</span>}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500">And a square <code className="font-mono text-[11px]">{'<rect id="qr" …/>'}</code> where the check-in QR code goes.</p>

                <input ref={svgRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => void readSvgFile(e.target.files?.[0])} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => svgRef.current?.click()} disabled={saving} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <FileCode2 className="w-4 h-4" aria-hidden />}{s.customSvg ? 'Replace design' : 'Upload SVG'}
                  </button>
                  <button type="button" onClick={() => setPasteOpen((o) => !o)} className="min-h-[44px] px-3 text-sm font-semibold text-gray-700 dark:text-gray-300">{pasteOpen ? 'Close' : 'Paste code instead'}</button>
                  {s.customSvg && (
                    <button type="button" onClick={() => setConfirmRemove(true)} className="inline-flex items-center gap-1 min-h-[44px] px-3 text-sm text-gray-600 dark:text-gray-400"><X className="w-4 h-4" aria-hidden />Remove design</button>
                  )}
                </div>
                {s.customSvg && <p className="mt-2 text-xs text-green-700 dark:text-green-400">Design added{s.template === 'custom' ? ' and in use' : ''}. {s.template !== 'custom' && <button type="button" onClick={() => set({ template: 'custom' })} className="underline font-semibold">Use it</button>}</p>}
                {pasteOpen && (
                  <div className="mt-3">
                    <label htmlFor="badge-svg-paste" className="sr-only">SVG code</label>
                    <textarea id="badge-svg-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} spellCheck={false} placeholder={'<svg viewBox="0 0 298 420" …>…</svg>'} className="input-field font-mono text-xs w-full" />
                    <button type="button" onClick={() => void applyDesign(paste)} disabled={!paste.trim() || saving} className="mt-2 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-200 dark:border-gray-700 text-sm font-semibold disabled:opacity-50">Use this design</button>
                  </div>
                )}
                {svgProblems.length > 0 && (
                  <ul role="alert" className="mt-3 space-y-1">
                    {svgProblems.map((p) => <li key={p.message} className={`text-xs ${p.level === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>{p.level === 'error' ? 'Fix: ' : 'Note: '}{p.message}</li>)}
                  </ul>
                )}

                <details className="mt-3 group">
                  <summary className="cursor-pointer min-h-[40px] flex items-center text-sm font-semibold text-gray-800 dark:text-gray-200">Get a design from Claude or ChatGPT</summary>
                  <div className="mt-1 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(BADGE_DESIGN_SIZES) as (keyof typeof BADGE_DESIGN_SIZES)[]).map((k) => (
                        <button key={k} type="button" aria-pressed={promptSize === k} onClick={() => setPromptSize(k)} className={`min-h-[36px] px-3 rounded-full border text-xs font-semibold ${promptSize === k ? 'border-gray-900 dark:border-gray-500 text-gray-900 dark:text-white' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>{BADGE_DESIGN_SIZES[k].label}</button>
                      ))}
                    </div>
                    <pre className="whitespace-pre-wrap rounded-[10px] bg-gray-50 dark:bg-gray-800 p-3 text-[11px] text-gray-700 dark:text-gray-300 select-all">{badgePrompt(eventTitle, promptSize)}</pre>
                    <button type="button" onClick={() => void copyPrompt()} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-200 dark:border-gray-700 text-sm font-semibold">{copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}{copied ? 'Copied' : 'Copy prompt'}</button>
                  </div>
                </details>
              </div>

              <div>
                <h3 className={h2}>Your own artwork</h3>
                <p className="text-xs text-gray-500 mt-0.5">A full background image (for example a Canva design). Name, details and QR are printed on top. Portrait for A6 cards.</p>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadBackground(e.target.files?.[0])} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ImagePlus className="w-4 h-4" aria-hidden />}{s.backgroundUrl ? 'Change artwork' : 'Upload artwork'}
                  </button>
                  {s.backgroundUrl && <button type="button" onClick={() => set({ backgroundUrl: null })} className="inline-flex items-center gap-1 min-h-[44px] px-3 text-sm text-gray-600 dark:text-gray-400"><X className="w-4 h-4" aria-hidden />Remove</button>}
                </div>
                {s.backgroundUrl && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-sm text-gray-700 dark:text-gray-300">Text position
                      <select value={s.textPosition} onChange={(e) => set({ textPosition: e.target.value as BadgeSettings['textPosition'] })} className="input-field mt-1">
                        <option value="top">Top</option><option value="center">Centre</option><option value="bottom">Bottom</option>
                      </select>
                    </label>
                    <label className="text-sm text-gray-700 dark:text-gray-300">Text colour
                      <select value={s.textColor} onChange={(e) => set({ textColor: e.target.value as BadgeSettings['textColor'] })} className="input-field mt-1">
                        <option value="dark">Dark (light artwork)</option><option value="light">Light (dark artwork)</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            </fieldset>
            {lock && <p id="pro-note" className="sr-only">These options are part of the Pro plan.</p>}
          </section>

          {/* Save */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}{dirty ? 'Save design' : 'Design saved'}
            </button>
            {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
          </div>

          {/* Print */}
          <section className={`${card} space-y-5`}>
            <div><h2 className={`${h2} mb-2`}>Size</h2><Choice name="layout" options={LAYOUTS} value={layout} onChange={setLayout} /></div>
            <div><h2 className={`${h2} mb-2`}>Who</h2><Choice name="who" options={WHO} value={who} onChange={setWho} /></div>
            <button type="button" onClick={() => void download()} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold w-full sm:w-auto">
              <Download className="w-4 h-4" aria-hidden /> {dirty ? 'Save design and download PDF' : 'Download PDF'}
            </button>
          </section>
        </div>

        {/* Preview */}
        {/* On phones the preview comes first (smaller), so changes are visible while making them. */}
        <aside className="order-first lg:order-none lg:sticky lg:top-4">
          <div className={card}>
            <h2 className={h2}>Preview</h2>
            <p className="text-xs text-gray-500 mt-0.5">A sample badge with your design{lock ? ' (Pro options show here too, to try them)' : ''}.</p>
            <div className="mt-3 mx-auto max-w-[220px] sm:max-w-[260px] lg:max-w-none rounded-[10px] bg-gray-100 dark:bg-gray-800 overflow-hidden">
              {!ownDesign ? (
                <BadgePreview settings={s} layout={previewLayout} eventTitle={eventTitle} eventDate={eventDate} logoUrl={logoUrl}
                  sponsorLogoUrls={sponsorLogoUrls} person={sample} questionLabels={questionLabels}
                  alt={`Sample badge in the ${BADGE_TEMPLATE_INFO[s.template].label} template`} />
              ) : previewUrl
                // eslint-disable-next-line @next/next/no-img-element -- a generated SVG preview, not a photo to optimise
                ? <img src={previewUrl} alt={`Sample badge in the ${BADGE_TEMPLATE_INFO[s.template].label} template`} className={`w-full ${previewLayout === 'label' ? 'aspect-[4/3]' : previewLayout === 'card' ? 'aspect-[243/153]' : 'aspect-[297/420]'} bg-white object-contain`} />
                : <div className="aspect-[297/420] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-hidden /></div>}
            </div>
          </div>
        </aside>
      </div>
      <ConfirmSheet
        open={confirmRemove}
        title="Remove your own design?"
        message="Badges go back to the Classic template. You can upload the design again any time."
        confirmLabel="Remove design"
        onConfirm={async () => ((await save({ ...s, customSvg: null, template: 'classic' })) ? undefined : 'Couldn’t remove it. Try again.')}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}
