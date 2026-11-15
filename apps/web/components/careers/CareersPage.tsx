import type { ApplyFormConfig } from '@/lib/jobs/apply-form';
import {
  TEMPLATE_INFO, visibleSections, type CareersContent, type CareersTemplate, type NameText, type Quote, type VisibleSection,
} from '@/lib/jobs/careers-content';
import { accentText, onAccent } from '@/components/embed/embed-utils';
import ExpandableText from './ExpandableText';
import RolesList from './RolesList';

/** One open role as the careers page lists it (already formatted). */
export interface PageJob { slug: string; title: string; team: string | null; meta: string[] }

export interface CareersPageData {
  slug: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  brandColor: string;
  headline: string;
  description: string;
  perks: string[];
  content: CareersContent;
  facts: { label: string; value: string }[];
  jobs: PageJob[];
  general: { slug: string } | null;
  applyForm: ApplyFormConfig;
  /** "Powered by Udyaibase" under the page (paid plans can hide it). */
  showPoweredBy: boolean;
}

/** Page colours as variables (NotifyForm / GeneralApplyCard / RolesList read them too). Brand values come in via style. */
const THEME =
  '[--w-text:#0a0a0b] [--w-muted:#5b5b66] [--w-border:#e7e7ea] [--w-surface:#ffffff] [--w-subtle:#f6f6f8] ' +
  '[--r-card:18px] [--r-control:12px] [--r-button:999px] [--embed-accent-text:var(--acc-l)] ' +
  '[&_h1]:[text-wrap:balance] [&_h2]:[text-wrap:balance] [-webkit-text-size-adjust:100%] ' +
  'dark:[--w-text:#f7f7f8] dark:[--w-muted:#a0a0ab] dark:[--w-border:#26262b] dark:[--w-surface:#111114] dark:[--w-subtle:#18181c] dark:[--embed-accent-text:var(--acc-d)]';

const FORCED = {
  light: { '--w-text': '#0a0a0b', '--w-muted': '#5b5b66', '--w-border': '#e7e7ea', '--w-surface': '#ffffff', '--w-subtle': '#f6f6f8' },
  dark: { '--w-text': '#f7f7f8', '--w-muted': '#a0a0ab', '--w-border': '#26262b', '--w-surface': '#111114', '--w-subtle': '#18181c' },
} as const;

const muted = { color: 'var(--w-muted)' };
const hair = { borderColor: 'var(--w-border)' };
const tile = { borderColor: 'var(--w-border)', background: 'var(--w-surface)', borderRadius: 'var(--r-card)' };
const two = (n: number) => String(n).padStart(2, '0');

type Variant = {
  width: string;
  serif: boolean;
  centered: boolean;
  values: 'grid' | 'list' | 'bento';
  perks: 'bento' | 'list' | 'chips';
  process: 'timeline' | 'list';
  voices: 'featured' | 'list';
  roles: 'rows' | 'cards';
};

/** Internal ids stay stable for saved pages; labels live in TEMPLATE_INFO. */
const V: Record<CareersTemplate, Variant> = {
  startup: { width: 'max-w-6xl', serif: false, centered: false, values: 'grid', perks: 'bento', process: 'timeline', voices: 'featured', roles: 'cards' },
  classic: { width: 'max-w-6xl', serif: false, centered: true, values: 'grid', perks: 'chips', process: 'timeline', voices: 'featured', roles: 'cards' },
  minimal: { width: 'max-w-3xl', serif: false, centered: false, values: 'list', perks: 'list', process: 'list', voices: 'list', roles: 'rows' },
  bold: { width: 'max-w-6xl', serif: false, centered: false, values: 'grid', perks: 'bento', process: 'timeline', voices: 'featured', roles: 'cards' },
  editorial: { width: 'max-w-3xl', serif: true, centered: false, values: 'list', perks: 'list', process: 'list', voices: 'list', roles: 'rows' },
  split: { width: 'max-w-6xl', serif: false, centered: false, values: 'bento', perks: 'bento', process: 'timeline', voices: 'featured', roles: 'cards' },
};

/**
 * A company's careers page in one of six templates (lib/jobs/careers-content.ts). Plain text only.
 * Used by the hosted page, the website widget's "Full careers page", and the portal's live preview.
 */
export default function CareersPage({ data, preview = false, linkQuery = '', newTab = false, theme }: {
  data: CareersPageData;
  preview?: boolean;
  /** Added to each role's link, e.g. "?source=widget&w=…" for applications that come through the website widget. */
  linkQuery?: string;
  /** Inside the website widget, roles open on Udyaibase in a new tab. */
  newTab?: boolean;
  /** Force light or dark; otherwise the page follows the site theme. */
  theme?: 'light' | 'dark';
}) {
  const t: CareersTemplate = data.content.template;
  const v = V[t];
  const brand = /^#[0-9a-f]{6}$/i.test(data.brandColor) ? data.brandColor : '#111827';
  // Midnight is dark whatever the site theme.
  const forced = t === 'bold' ? 'dark' : theme;
  const vars = {
    '--embed-accent': brand,
    '--embed-on-accent': onAccent(brand),
    '--acc-l': accentText(brand, '#ffffff', '#0a0a0b'),
    '--acc-d': accentText(brand, '#111114', '#f7f7f8'),
    '--glow': `color-mix(in srgb, ${brand} 22%, transparent)`,
    ...(forced ? { ...FORCED[forced], '--embed-accent-text': forced === 'dark' ? 'var(--acc-d)' : 'var(--acc-l)' } : {}),
    color: 'var(--w-text)',
  } as unknown as React.CSSProperties;

  const sections = visibleSections(data.content, { name: data.name, headline: data.headline, description: data.description, perks: data.perks });
  const intro = sections.find((s) => s.type === 'intro');
  const introBody = intro?.type === 'intro' ? intro.body : '';
  const headline = (intro?.type === 'intro' && intro.headline) || `Build what’s next at ${data.name}`;
  const rest = sections.filter((s) => s.type !== 'intro');
  const order = TEMPLATE_INFO[t].order;
  const rolesAt = order.indexOf('roles');
  // Bento shows the mission and perks inside its hero grid.
  const mission = rest.find((s) => s.type === 'mission');
  const perksShown = rest.some((s) => s.type === 'perks');
  const body = t === 'split' ? rest.filter((s) => s.type !== 'mission' && s.type !== 'perks') : rest;
  const before = body.filter((s) => order.indexOf(s.type) < rolesAt);
  const after = body.filter((s) => order.indexOf(s.type) > rolesAt);

  const hero = { data, headline, introBody, brand };
  const roles = (
    <SectionShell id="open-roles" eyebrow={data.jobs.length > 0 ? `${data.jobs.length} open role${data.jobs.length === 1 ? '' : 's'}` : 'Open roles'}
      title={data.jobs.length > 0 ? 'Open roles' : 'No open roles right now'} v={v}>
      <RolesList jobs={data.jobs} slug={data.slug} company={data.name} general={data.general} applyForm={data.applyForm}
        preview={preview} linkQuery={linkQuery} newTab={newTab} variant={v.roles} centered={v.centered} />
    </SectionShell>
  );

  const page = (
    <div className={`${v.width} mx-auto font-jakarta`}>
      {t === 'startup' && <LaunchHero {...hero} />}
      {t === 'classic' && <StoryHero {...hero} />}
      {t === 'minimal' && <MinimalHero {...hero} />}
      {t === 'bold' && <MidnightHero {...hero} />}
      {t === 'editorial' && <LetterHero {...hero} />}
      {t === 'split' && <BentoHero {...hero} mission={mission?.type === 'mission' ? mission : undefined} perks={perksShown ? data.perks : []} />}

      <div className={`flex flex-col ${v.width === 'max-w-3xl' ? 'gap-12 sm:gap-16 mt-12 sm:mt-16' : 'gap-14 sm:gap-24 mt-12 sm:mt-24'}`}>
        {before.map((s) => <Section key={s.id} s={s} v={v} company={data.name} template={t} />)}
        {roles}
        {after.map((s) => <Section key={s.id} s={s} v={v} company={data.name} template={t} />)}
      </div>

      {data.showPoweredBy && (
        <p className="mt-14 sm:mt-20 pt-6 border-t text-center text-xs" style={{ ...hair, ...muted }}>
          <a href="https://udyaibase.com/?ref=careers-page" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 min-h-[44px] px-2 hover:underline underline-offset-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding_logo.svg" alt="" width={16} height={16} className="w-4 h-4 rounded-[4px]" />
            Powered by Udyaibase
          </a>
        </p>
      )}
    </div>
  );

  return (
    <div className={THEME} style={vars}>
      {t === 'bold'
        ? <div className="px-4 py-8 sm:px-10 sm:py-14 overflow-hidden rounded-[24px] sm:rounded-[32px]" style={{ background: '#09090b' }}>{page}</div>
        : page}
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────

function Logo({ data, size }: { data: CareersPageData; size: number }) {
  if (!data.logoUrl) {
    return (
      <span aria-hidden className="inline-flex items-center justify-center rounded-xl font-sora font-bold shrink-0"
        style={{ width: size, height: size, background: 'var(--embed-accent)', color: 'var(--embed-on-accent)', fontSize: size * 0.42 }}>
        {data.name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={data.logoUrl} alt={`${data.name} logo`} width={size} height={size} className="rounded-xl bg-white object-contain p-1 border shrink-0" style={{ width: size, height: size, ...hair }} />;
}

function HiringPill({ data, dark = false }: { data: CareersPageData; dark?: boolean }) {
  const n = data.jobs.length;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
      style={{ borderColor: dark ? 'rgba(255,255,255,.14)' : 'var(--w-border)', background: dark ? 'rgba(255,255,255,.04)' : 'var(--w-surface)' }}>
      <span className="relative flex w-2 h-2">
        {n > 0 && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: '#22c55e' }} />}
        <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: n > 0 ? '#22c55e' : 'var(--w-muted)' }} />
      </span>
      {n > 0 ? `Hiring now · ${n} open role${n === 1 ? '' : 's'}` : `Careers at ${data.name}`}
    </span>
  );
}

function Ctas({ data, center = false }: { data: CareersPageData; center?: boolean }) {
  return (
    <div className={`mt-8 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 ${center ? 'sm:justify-center' : ''}`}>
      <a href="#open-roles" className="inline-flex items-center justify-center gap-2 min-h-[50px] sm:min-h-[46px] px-6 text-[0.9375rem] sm:text-sm font-semibold transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
        style={{ background: 'var(--embed-accent)', color: 'var(--embed-on-accent)', borderRadius: 'var(--r-button)' }}>
        {data.jobs.length > 0 ? 'See open roles' : 'Get notified'}
        <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4v12m-5-5 5 5 5-5" /></svg>
      </a>
      {data.websiteUrl && (
        <a href={data.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center min-h-[50px] sm:min-h-[46px] px-6 text-[0.9375rem] sm:text-sm font-semibold border active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
          style={{ ...hair, borderRadius: 'var(--r-button)' }}>
          About {data.name}
        </a>
      )}
    </div>
  );
}

function FactsRow({ facts, center = false }: { facts: CareersPageData['facts']; center?: boolean }) {
  if (!facts.length) return null;
  return (
    <dl className={`mt-10 sm:mt-12 grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap gap-y-6 ${center ? 'sm:justify-center text-left sm:text-center' : ''}`}>
      {facts.map((f, i) => (
        <div key={f.label} className={`sm:px-8 ${i === 0 && !center ? 'sm:pl-0' : ''} ${i > 0 ? 'sm:border-l' : ''}`} style={hair}>
          <dt className="text-xs uppercase tracking-[0.14em] font-medium" style={muted}>{f.label}</dt>
          <dd className="mt-1.5 font-sora text-xl sm:text-2xl font-bold tracking-tight">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Intro({ text, className = '', serif = false }: { text: string; className?: string; serif?: boolean }) {
  if (!text) return null;
  return <div className={`${className} ${serif ? 'font-serif' : ''}`} style={muted}><ExpandableText text={text} className="text-lg sm:text-xl leading-relaxed whitespace-pre-line" /></div>;
}

type HeroProps = { data: CareersPageData; headline: string; introBody: string; brand: string };

// ── Heroes ─────────────────────────────────────────────

/** Launch: type-led hero on a soft brand glow and dot grid, then a facts row. */
function LaunchHero({ data, headline, introBody }: HeroProps) {
  return (
    <header className="relative overflow-hidden border px-5 py-10 sm:px-14 sm:py-20 rounded-[24px] sm:rounded-[28px]" style={hair}>
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(70% 60% at 85% 0%, var(--glow), transparent 70%)' }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: 'radial-gradient(var(--w-border) 1px, transparent 1px)', backgroundSize: '22px 22px',
          maskImage: 'linear-gradient(to bottom, black, transparent 75%)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 75%)',
        }} />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3"><Logo data={data} size={36} /><HiringPill data={data} /></div>
        <h1 className="mt-8 font-sora text-[2.4rem] leading-[1.03] sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.035em] max-w-4xl">{headline}</h1>
        <Intro text={introBody} className="mt-6 max-w-2xl" />
        <Ctas data={data} />
        <FactsRow facts={data.facts} />
      </div>
    </header>
  );
}

/** Story: centred, editorial hero with an eyebrow label. */
function StoryHero({ data, headline, introBody }: HeroProps) {
  return (
    <header className="text-center pt-6 sm:pt-12">
      <div className="flex justify-center"><Logo data={data} size={48} /></div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--embed-accent-text)' }}>Careers at {data.name}</p>
      <h1 className="mt-4 font-sora text-[2.4rem] leading-[1.05] sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.035em] max-w-4xl mx-auto">{headline}</h1>
      <Intro text={introBody} className="mt-6 max-w-2xl mx-auto" />
      <Ctas data={data} center />
      <FactsRow facts={data.facts} center />
    </header>
  );
}

/** Minimal: quiet, left-aligned, hairlines only. */
function MinimalHero({ data, headline, introBody }: HeroProps) {
  return (
    <header className="pt-4 sm:pt-10">
      <div className="flex items-center gap-3"><Logo data={data} size={28} /><span className="text-sm font-semibold">{data.name}</span></div>
      <h1 className="mt-10 font-sora text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-[1.08]">{headline}</h1>
      <Intro text={introBody} className="mt-5" />
      <a href="#open-roles" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline underline-offset-4" style={{ color: 'var(--embed-accent-text)' }}>
        {data.jobs.length > 0 ? `${data.jobs.length} open role${data.jobs.length === 1 ? '' : 's'}` : 'Get notified about new roles'} ↓
      </a>
    </header>
  );
}

/** Midnight: dark and premium, with a brand glow and faint grid lines. */
function MidnightHero({ data, headline, introBody }: HeroProps) {
  return (
    <header className="relative pt-4 sm:pt-10 pb-2">
      <div aria-hidden className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] max-w-[160%] h-[440px] pointer-events-none"
        style={{ background: 'radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)' }} />
      <div aria-hidden className="absolute -inset-x-10 -top-10 bottom-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)',
          backgroundSize: '56px 56px', maskImage: 'radial-gradient(60% 70% at 50% 25%, black, transparent)', WebkitMaskImage: 'radial-gradient(60% 70% at 50% 25%, black, transparent)',
        }} />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3"><Logo data={data} size={36} /><HiringPill data={data} dark /></div>
        <h1 className="mt-8 font-sora text-[2.5rem] leading-[1.02] sm:text-7xl lg:text-[5.25rem] font-extrabold tracking-[-0.045em] max-w-5xl"
          style={{ background: 'linear-gradient(180deg, #ffffff 35%, #9f9fa9)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          {headline}
        </h1>
        <Intro text={introBody} className="mt-6 max-w-2xl" />
        <Ctas data={data} />
        <FactsRow facts={data.facts} />
      </div>
    </header>
  );
}

/** Letter: a founder-letter feel, serif and personal. */
function LetterHero({ data, headline, introBody }: HeroProps) {
  return (
    <header className="pt-4 sm:pt-10">
      <div className="flex items-center gap-3"><Logo data={data} size={32} /><span className="text-xs font-semibold uppercase tracking-[0.2em]" style={muted}>Careers · {data.name}</span></div>
      <h1 className="mt-10 font-serif text-[2.6rem] leading-[1.06] sm:text-6xl font-medium tracking-[-0.02em]">{headline}</h1>
      <Intro text={introBody} className="mt-6" serif />
      <a href="#open-roles" className="mt-8 inline-flex items-center gap-2 min-h-[46px] px-6 text-sm font-semibold"
        style={{ background: 'var(--w-text)', color: 'var(--w-surface)', borderRadius: 'var(--r-button)' }}>
        {data.jobs.length > 0 ? `View ${data.jobs.length} open role${data.jobs.length === 1 ? '' : 's'}` : 'Get notified'}
      </a>
      <div aria-hidden className="mt-14 h-px" style={{ background: 'var(--w-border)' }} />
    </header>
  );
}

/** Bento: the company story as a modular grid of tiles (stacks on phones). */
function BentoHero({ data, headline, introBody, brand, mission, perks }: HeroProps & {
  mission?: Extract<VisibleSection, { type: 'mission' }>; perks: string[];
}) {
  const on = onAccent(brand);
  const n = data.jobs.length;
  const box = { ...tile, borderRadius: '24px' };
  return (
    <header className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-6">
      <div className="lg:col-span-4 lg:row-span-2 border p-6 sm:p-10 flex flex-col justify-between relative overflow-hidden" style={box}>
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 70% at 100% 0%, var(--glow), transparent 70%)' }} />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3"><Logo data={data} size={36} /><HiringPill data={data} /></div>
          <h1 className="mt-8 font-sora text-[2.4rem] sm:text-6xl font-extrabold tracking-[-0.035em] leading-[1.03]">{headline}</h1>
          <Intro text={introBody} className="mt-5 max-w-xl" />
        </div>
        <div className="relative"><Ctas data={data} /></div>
      </div>
      <a href="#open-roles" className="lg:col-span-2 p-6 sm:p-7 flex flex-col justify-between gap-6 min-h-[140px] sm:min-h-[180px] transition-transform hover:-translate-y-0.5 active:scale-[0.99]" style={{ background: brand, color: on, borderRadius: '24px' }}>
        <span className="text-sm font-semibold opacity-85">{n > 0 ? 'Open roles' : 'Not hiring right now'}</span>
        <span className="flex items-end justify-between">
          {n > 0
            ? <span className="font-sora text-6xl sm:text-7xl font-extrabold tracking-tighter leading-none">{n}</span>
            : <span className="font-sora text-3xl font-extrabold tracking-tight leading-tight">Get notified when we are</span>}
          <svg aria-hidden viewBox="0 0 20 20" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14 14 6m-6 0h6v6" /></svg>
        </span>
      </a>
      <div className="lg:col-span-2 border p-6 sm:p-7" style={box}>
        {data.facts.length > 0 ? (
          <dl className="grid grid-cols-2 gap-5">
            {data.facts.map((f) => (
              <div key={f.label}><dt className="text-xs uppercase tracking-[0.14em]" style={muted}>{f.label}</dt><dd className="mt-1 font-sora text-lg font-bold">{f.value}</dd></div>
            ))}
          </dl>
        ) : <p className="font-sora text-xl font-bold">Small team. Big ownership.</p>}
      </div>
      {mission && (
        <div className={`${perks.length ? 'lg:col-span-4' : 'lg:col-span-6'} border p-6 sm:p-9`} style={{ ...box, background: 'var(--w-subtle)' }}>
          <p className="text-xs uppercase tracking-[0.18em] font-semibold" style={{ color: 'var(--embed-accent-text)' }}>{mission.title}</p>
          {mission.statement && <p className="mt-3 font-sora text-2xl sm:text-3xl font-bold tracking-tight leading-snug">{mission.statement}</p>}
          {mission.body && <p className="mt-3 leading-relaxed whitespace-pre-line" style={muted}>{mission.body}</p>}
        </div>
      )}
      {perks.length > 0 && (
        <div className={`${mission ? 'lg:col-span-2' : 'lg:col-span-6'} border p-6 sm:p-7`} style={box}>
          <p className="text-xs uppercase tracking-[0.18em] font-semibold" style={muted}>Perks</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {perks.slice(0, 8).map((p) => <li key={p} className="rounded-full border px-3 py-1 text-sm" style={hair}>{p}</li>)}
            {perks.length > 8 && <li className="px-1 py-1 text-sm" style={muted}>+{perks.length - 8} more</li>}
          </ul>
        </div>
      )}
    </header>
  );
}

// ── Sections ───────────────────────────────────────────

function SectionShell({ id, eyebrow, title, v, children }: { id: string; eyebrow: string; title: string; v: Variant; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={title ? `${id}-h` : undefined} className="scroll-mt-24">
      <div className={`mb-6 sm:mb-10 ${v.centered ? 'text-center' : ''}`}>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--embed-accent-text)' }}>{eyebrow}</p>}
        {title && (
          <h2 id={`${id}-h`} className={`mt-3 ${v.serif ? 'font-serif text-[1.75rem] sm:text-4xl font-medium tracking-tight' : 'font-sora text-[1.75rem] sm:text-[2.6rem] font-bold leading-[1.12] tracking-[-0.03em]'}`}>
            {title}
          </h2>
        )}
      </div>
      {children}
    </section>
  );
}

const EYEBROW: Record<string, string> = { values: 'How we work', perks: 'Benefits', process: 'Hiring process', voices: 'Life on the team', text: '' };

function Section({ s, v, company, template }: { s: VisibleSection; v: Variant; company: string; template: CareersTemplate }) {
  const id = `life-${s.id}`;
  if (s.type === 'mission') return <Mission s={s} v={v} company={company} template={template} id={id} />;
  return (
    <SectionShell id={id} eyebrow={EYEBROW[s.type] ?? ''} title={s.title} v={v}>
      {s.type === 'values' && <Values items={s.items} variant={v.values} />}
      {s.type === 'perks' && <Perks perks={s.perks} variant={v.perks} centered={v.centered} />}
      {s.type === 'process' && <Process items={s.items} variant={v.process} />}
      {s.type === 'voices' && <Voices quotes={s.quotes} variant={v.voices} serif={v.serif} />}
      {s.type === 'text' && <p className={`text-lg leading-relaxed whitespace-pre-line max-w-3xl ${v.centered ? 'mx-auto text-center' : ''} ${v.serif ? 'font-serif' : ''}`} style={muted}>{s.body}</p>}
    </SectionShell>
  );
}

function Mission({ s, v, company, template, id }: { s: Extract<VisibleSection, { type: 'mission' }>; v: Variant; company: string; template: CareersTemplate; id: string }) {
  if (template === 'editorial') {
    // A short letter from the team.
    return (
      <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--embed-accent-text)' }}>{s.title}</p>
        <h2 id={`${id}-h`} className="mt-4 font-serif text-3xl sm:text-4xl leading-[1.25] font-medium">{s.statement || s.title}</h2>
        {s.body && <p className="mt-6 font-serif text-xl leading-[1.75] whitespace-pre-line" style={muted}>{s.body}</p>}
        <p className="mt-8 font-serif italic text-lg">— The {company} team</p>
      </section>
    );
  }
  if (template === 'minimal') {
    return (
      <SectionShell id={id} eyebrow="" title={s.title} v={v}>
        {s.statement && <p className="text-2xl font-semibold leading-snug tracking-tight">{s.statement}</p>}
        {s.body && <p className="mt-4 text-lg leading-relaxed whitespace-pre-line" style={muted}>{s.body}</p>}
      </SectionShell>
    );
  }
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`scroll-mt-24 ${v.centered ? 'text-center' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--embed-accent-text)' }}>{s.title}</p>
      <h2 id={`${id}-h`} className={`mt-4 sm:mt-5 font-sora text-[1.75rem] sm:text-5xl font-bold leading-[1.18] tracking-[-0.03em] max-w-5xl ${v.centered ? 'mx-auto' : ''}`}>
        {s.statement || s.title}
      </h2>
      {s.body && <p className={`mt-6 text-lg sm:text-xl leading-relaxed whitespace-pre-line max-w-3xl ${v.centered ? 'mx-auto' : ''}`} style={muted}>{s.body}</p>}
    </section>
  );
}

function Values({ items, variant }: { items: NameText[]; variant: Variant['values'] }) {
  if (variant === 'list') {
    return (
      <ol className="border-t" style={hair}>
        {items.map((v, i) => (
          <li key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_13rem_minmax(0,1fr)] gap-x-4 gap-y-1 py-5 border-b" style={hair}>
            <span className="font-mono text-sm pt-0.5" style={muted}>{two(i + 1)}</span>
            <span className="font-semibold">{v.name}</span>
            {v.text && <span className="col-start-2 sm:col-start-3 leading-relaxed" style={muted}>{v.text}</span>}
          </li>
        ))}
      </ol>
    );
  }
  if (variant === 'bento') {
    return (
      <ul className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
        {items.map((v, i) => (
          <li key={i} className={`border p-6 sm:p-7 ${i % 4 === 0 || i % 4 === 3 ? 'lg:col-span-4' : 'lg:col-span-2'}`} style={{ ...tile, borderRadius: '24px', ...(i === 0 ? { background: 'var(--w-subtle)' } : {}) }}>
            <span className="font-mono text-sm" style={{ color: 'var(--embed-accent-text)' }}>{two(i + 1)}</span>
            <p className="mt-6 font-sora text-xl font-bold tracking-tight">{v.name}</p>
            {v.text && <p className="mt-2 leading-relaxed" style={muted}>{v.text}</p>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ol className={`grid gap-x-10 gap-y-6 sm:gap-y-10 sm:grid-cols-2 ${items.length % 3 === 0 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} text-left`}>
      {items.map((v, i) => (
        <li key={i} className="border-t pt-5 sm:pt-6" style={hair}>
          <span className="font-mono text-sm" style={{ color: 'var(--embed-accent-text)' }}>{two(i + 1)}</span>
          <p className="mt-2 sm:mt-3 font-sora text-lg sm:text-xl font-bold tracking-tight">{v.name}</p>
          {v.text && <p className="mt-2 leading-relaxed" style={muted}>{v.text}</p>}
        </li>
      ))}
    </ol>
  );
}

const Tick = () => (
  <svg aria-hidden viewBox="0 0 20 20" className="w-[18px] h-[18px] shrink-0" fill="none" stroke="var(--embed-accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
);

function Perks({ perks, variant, centered }: { perks: string[]; variant: Variant['perks']; centered: boolean }) {
  if (variant === 'chips') {
    return (
      <ul className={`flex flex-wrap gap-2.5 ${centered ? 'justify-center max-w-4xl mx-auto' : ''}`}>
        {perks.map((p) => <li key={p} className="inline-flex items-center gap-2 rounded-full border px-4 py-2" style={tile}><Tick />{p}</li>)}
      </ul>
    );
  }
  if (variant === 'list') {
    return (
      <ul className="grid gap-x-8 sm:grid-cols-2 border-t" style={hair}>
        {perks.map((p) => <li key={p} className="flex items-center gap-3 py-3.5 border-b" style={hair}><Tick />{p}</li>)}
      </ul>
    );
  }
  return (
    <ul className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {perks.map((p) => (
        <li key={p} className="flex flex-col justify-between gap-4 sm:gap-6 p-4 sm:p-5 min-h-[108px] sm:min-h-[124px] text-[0.9375rem] sm:text-base" style={{ background: 'var(--w-subtle)', borderRadius: 'var(--r-card)' }}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--w-surface)' }}><Tick /></span>
          <span className="font-semibold leading-snug">{p}</span>
        </li>
      ))}
    </ul>
  );
}

function Process({ items, variant }: { items: NameText[]; variant: Variant['process'] }) {
  if (variant === 'list') {
    return (
      <ol className="flex flex-col">
        {items.map((s, i) => (
          <li key={i} className="relative pl-12 pb-8 last:pb-0">
            {i < items.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 bottom-1 w-px" style={{ background: 'var(--w-border)' }} />}
            <span aria-hidden className="absolute left-0 top-0 w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs" style={hair}>{i + 1}</span>
            <p className="font-semibold pt-1">{s.name}</p>
            {s.text && <p className="mt-1 leading-relaxed" style={muted}>{s.text}</p>}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={`grid gap-0 sm:gap-8 sm:grid-cols-2 ${items.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {items.map((s, i) => (
        <li key={i} className="relative pl-14 pb-7 last:pb-0 sm:pl-0 sm:pb-0">
          {i < items.length - 1 && <span aria-hidden className="sm:hidden absolute left-5 top-11 bottom-1 w-px" style={{ background: 'var(--w-border)' }} />}
          <div className="absolute left-0 top-0 sm:static flex items-center gap-3">
            <span aria-hidden className="w-10 h-10 rounded-full flex items-center justify-center font-sora font-bold text-sm shrink-0"
              style={{ background: 'var(--embed-accent)', color: 'var(--embed-on-accent)' }}>{i + 1}</span>
            {i < items.length - 1 && <span aria-hidden className="hidden lg:block h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--w-border), transparent)' }} />}
          </div>
          <p className="pt-2 sm:pt-0 sm:mt-5 font-sora text-lg font-bold tracking-tight">{s.name}</p>
          {s.text && <p className="mt-1 sm:mt-1.5 leading-relaxed" style={muted}>{s.text}</p>}
        </li>
      ))}
    </ol>
  );
}

function Voices({ quotes, variant, serif }: { quotes: Quote[]; variant: Variant['voices']; serif: boolean }) {
  const [first, ...others] = quotes;
  const person = (q: Quote) => (
    <p className="text-sm"><span className="font-semibold">{q.name}</span>{q.role && <span style={muted}> · {q.role}</span>}</p>
  );
  if (variant === 'list') {
    return (
      <ul className="flex flex-col gap-10">
        {quotes.map((q, i) => (
          <li key={i} className="border-l-2 pl-6" style={{ borderColor: 'var(--embed-accent)' }}>
            <blockquote className={`text-lg sm:text-xl leading-relaxed whitespace-pre-line ${serif ? 'font-serif' : ''}`}>“{q.quote}”</blockquote>
            <div className="mt-3">{person(q)}</div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <figure className={`${others.length ? 'lg:col-span-2' : 'lg:col-span-3'} border p-6 sm:p-10 flex flex-col justify-between`} style={{ ...tile, borderRadius: '24px' }}>
        <blockquote className="font-sora text-xl sm:text-3xl font-semibold leading-snug tracking-tight whitespace-pre-line">“{first.quote}”</blockquote>
        <figcaption className="mt-8">{person(first)}</figcaption>
      </figure>
      {others.length > 0 && (
        <div className="flex flex-col gap-4">
          {others.map((q, i) => (
            <figure key={i} className="border p-6 flex-1" style={tile}>
              <blockquote className="leading-relaxed whitespace-pre-line">“{q.quote}”</blockquote>
              <figcaption className="mt-4">{person(q)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
