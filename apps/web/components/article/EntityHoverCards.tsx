'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { BadgeCheck, ExternalLink, Star } from 'lucide-react';
import BookmarkButton from '@/components/BookmarkButton';
import type { EntityCard } from '@/lib/article-entities';

/**
 * Preview cards for tagged startups and tools inside an article body. Desktop: hover a name (or Tab to it) and a
 * small profile card opens; it stays open while the pointer is on it. Touch screens get no card: tapping the
 * name goes straight to the profile. One listener on the article, so existing article HTML works unchanged.
 */

const OPEN_MS = 300;
const CLOSE_MS = 150;
const WIDTH = 320;
const GAP = 8;
const MARGIN = 16;

const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`);
const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

function pathOf(a: HTMLAnchorElement): string | null {
  try {
    const u = new URL(a.href, window.location.href);
    if (u.origin !== window.location.origin && !/(^|\.)udyaibase\.com$/i.test(u.hostname)) return null;
    return u.pathname.replace(/\/$/, '').toLowerCase();
  } catch { return null; }
}

function Logo({ src, name }: { src: string | null; name: string }) {
  return (
    <span className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts */}
      {src ? <img src={src} alt="" width={44} height={44} className="w-full h-full object-cover" loading="lazy" /> : <span className="font-sora font-bold text-brand">{name.charAt(0)}</span>}
    </span>
  );
}

function CardBody({ card }: { card: EntityCard }) {
  const href = card.kind === 'startup' ? `/startups/${card.slug}` : `/tools/${card.slug}`;
  const facts = card.kind === 'startup'
    ? [card.sector, card.city, card.stage].filter(Boolean)
    : [card.category, card.pricing].filter(Boolean);
  return (
    <>
      <div className="flex items-start gap-3">
        <Logo src={card.logoUrl} name={card.name} />
        <div className="min-w-0">
          <p className="font-sora font-bold text-navy dark:text-white flex items-center gap-1 leading-tight">
            <span className="truncate">{card.name}</span>
            {card.kind === 'startup' && card.verified && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" aria-label="Verified" />}
          </p>
          {facts.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{facts.join(' · ')}</p>}
        </div>
      </div>
      {card.tagline && <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 line-clamp-2 leading-snug">{card.tagline}</p>}

      {card.kind === 'startup' ? (
        (card.raisedUsd || card.lastRound || card.foundedYear) && (
          <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
            {[
              ['Raised', card.raisedUsd ? usd(card.raisedUsd) : '—'],
              ['Last round', card.lastRound ? card.lastRound.type : '—'],
              ['Founded', card.foundedYear ? String(card.foundedYear) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-1.5 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-gray-400">{k}</dt>
                <dd className="text-xs font-semibold text-navy dark:text-white truncate" title={k === 'Last round' && card.lastRound ? `${card.lastRound.type} · ${monthYear(card.lastRound.date)}` : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
        )
      ) : (
        card.rating && (
          <p className="flex items-center gap-1 mt-3 text-sm text-gray-700 dark:text-gray-300">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> <strong>{card.rating}</strong>
            <span className="text-gray-400">({card.reviews} review{card.reviews === 1 ? '' : 's'})</span>
          </p>
        )
      )}

      <div className="flex items-center gap-2 mt-4">
        <Link href={href} className="btn-brand flex-1 justify-center text-sm py-2">{card.kind === 'startup' ? 'View profile' : 'View tool'}</Link>
        {card.kind === 'tool' && card.websiteUrl && (
          <a href={`/api/tools/click?toolId=${encodeURIComponent(card.id)}&source=OTHER`} target="_blank" rel="nofollow noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-brand hover:text-brand">
            Visit <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <BookmarkButton type={card.kind} itemId={card.slug} itemName={card.name} variant="icon" size="md" />
      </div>
    </>
  );
}

export default function EntityHoverCards({ cards, children }: { cards: Record<string, EntityCard>; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboard = useRef(false);
  const [open, setOpen] = useState<{ anchor: HTMLAnchorElement; card: EntityCard } | null>(null);
  const openAnchor = useRef<HTMLAnchorElement | null>(null);
  openAnchor.current = open?.anchor ?? null;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const hasCards = Object.keys(cards).length > 0;

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const scheduleClose = useCallback(() => { clear(); timer.current = setTimeout(() => setOpen(null), CLOSE_MS); }, []);
  const show = useCallback((a: HTMLAnchorElement, delay: number) => {
    const path = pathOf(a);
    const card = path ? cards[path] : undefined;
    if (!card) return;
    clear();
    if (openAnchor.current === a) return; // already showing (pointer came back from the card)
    timer.current = setTimeout(() => { setPos(null); setOpen({ anchor: a, card }); }, delay);
  }, [cards]);

  // Event delegation on the article body.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !hasCards) return;
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    const anchorOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest('a[href]') as HTMLAnchorElement | null) : null);
    const over = (e: PointerEvent) => { if (e.pointerType === 'mouse' && canHover.matches) { const a = anchorOf(e.target); if (a) show(a, OPEN_MS); } };
    const out = (e: PointerEvent) => { if (anchorOf(e.target) && !anchorOf(e.relatedTarget)) scheduleClose(); };
    // Focus opens the card only for keyboard users (a tap also focuses the link, and must just navigate).
    const focusIn = (e: FocusEvent) => { const a = anchorOf(e.target); if (a && keyboard.current) show(a, 0); };
    const focusOut = () => scheduleClose();
    const key = (e: KeyboardEvent) => { keyboard.current = e.key === 'Tab' || keyboard.current; if (e.key === 'Escape') { clear(); setOpen(null); } };
    const pointer = () => { keyboard.current = false; };
    wrap.addEventListener('pointerover', over);
    wrap.addEventListener('pointerout', out);
    wrap.addEventListener('focusin', focusIn);
    wrap.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', pointer);
    return () => {
      wrap.removeEventListener('pointerover', over);
      wrap.removeEventListener('pointerout', out);
      wrap.removeEventListener('focusin', focusIn);
      wrap.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', pointer);
      clear();
    };
  }, [hasCards, show, scheduleClose]);

  // Place below the name, or above when there's no room; always fully on screen.
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const r = open.anchor.getBoundingClientRect();
    const h = cardRef.current.offsetHeight;
    const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2);
    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - width - MARGIN));
    const below = r.bottom + GAP + h <= window.innerHeight - MARGIN || r.top - GAP - h < MARGIN;
    setPos({ top: (below ? r.bottom + GAP : r.top - GAP - h) + window.scrollY, left: left + window.scrollX });
  }, [open]);

  // Link the name to the card for screen readers while it's open.
  useEffect(() => {
    if (!open) return;
    open.anchor.setAttribute('aria-describedby', 'entity-hover-card');
    const close = () => setOpen(null);
    window.addEventListener('resize', close);
    return () => { open.anchor.removeAttribute('aria-describedby'); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <div ref={wrapRef}>
      {children}
      {open && createPortal(
        <div
          ref={cardRef}
          id="entity-hover-card"
          role="dialog"
          aria-label={`${open.card.name} preview`}
          onPointerEnter={clear}
          onPointerLeave={scheduleClose}
          onFocus={clear}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose(); }}
          style={{ position: 'absolute', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: `min(${WIDTH}px, calc(100vw - ${MARGIN * 2}px))`, visibility: pos ? 'visible' : 'hidden' }}
          className="z-dropdown rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-4 animate-in fade-in duration-150"
        >
          <CardBody card={open.card} />
        </div>,
        document.body,
      )}
    </div>
  );
}
