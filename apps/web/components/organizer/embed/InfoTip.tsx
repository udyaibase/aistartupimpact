"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

const WIDTH = 256;

/**
 * Accessible "i" tooltip: hover or focus on desktop, tap on touch; Escape or an outside tap closes it.
 * Positioned against the viewport so cards with overflow-hidden never clip it.
 */
export default function InfoTip({ label, children }: { label: string; children: React.ReactNode; align?: "start" | "center" | "end" }) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const left = Math.min(Math.max(12, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 12);
      const above = window.innerHeight - r.bottom < 160;
      setPos({ top: above ? r.top - 6 : r.bottom + 6, left, above });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setPinned(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="inline-flex align-middle"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => !pinned && setOpen(false)}>
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); const next = !pinned; setPinned(next); setOpen(next); }}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className="inline-flex items-center justify-center w-6 h-6 -my-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15]"
      >
        <Info className="w-3.5 h-3.5" aria-hidden />
      </button>
      {open && pos && (
        <span
          id={id}
          role="tooltip"
          className="fixed z-[500] rounded-[10px] bg-gray-900 dark:bg-gray-700 text-white text-xs font-normal leading-relaxed normal-case tracking-normal text-left px-3 py-2.5 shadow-lg"
          style={{ top: pos.top, left: pos.left, width: WIDTH, transform: pos.above ? "translateY(-100%)" : undefined }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
