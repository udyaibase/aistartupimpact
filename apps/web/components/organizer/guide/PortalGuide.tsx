"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { GuideStep, Tour } from "./tours";

const PAD = 8;
const CARD_W = 340;

const btnPrimary =
  "inline-flex items-center justify-center min-h-[40px] px-4 rounded-[10px] bg-[#A50F15] hover:bg-[#8C0D12] text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#A50F15]";
const btnGhost =
  "inline-flex items-center justify-center min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15]";

const storageKey = (id: string) => `udyaibase:guide:${id}:v1`;

export function tourSeen(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === "done";
  } catch {
    return true; // storage blocked: don't auto-open on every visit
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(storageKey(id), "done");
  } catch {}
}

function visibleTarget(step: GuideStep): Element | null {
  if (!step.target) return null;
  const names = Array.isArray(step.target) ? step.target : [step.target];
  for (const n of names) {
    const el = document.querySelector(`[data-tour="${n}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Steps whose target isn't on screen (mobile, empty states) are skipped. */
function availableSteps(tour: Tour): GuideStep[] {
  return tour.steps.filter((s) => !s.target || visibleTarget(s));
}

export default function PortalGuide({ tour, open, onClose }: { tour: Tour; open: boolean; onClose: () => void }) {
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vp, setVp] = useState({ w: 1024, h: 768 });
  const primaryRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;
  const hasIntro = !!steps[0] && !steps[0].target;

  const finish = useCallback(() => {
    markSeen(tour.id);
    setIndex(0);
    onCloseRef.current();
  }, [tour.id]);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setSteps(availableSteps(tour));
  }, [open, tour]);

  useEffect(() => {
    if (!open || !step) return;
    visibleTarget(step)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, step]);

  // Follow the target through scrolling (including inner scroll areas) and resizes.
  useLayoutEffect(() => {
    if (!open || !step) return;
    let raf = 0;
    const tick = () => {
      setVp((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      const el = visibleTarget(step);
      const r = el?.getBoundingClientRect() ?? null;
      setRect((prev) =>
        prev && r && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height ? prev : r,
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, step]);

  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, steps.length]);

  if (!open || !step) return null;

  const mobile = vp.w < 640;
  const hole = rect && step.target
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  let cardStyle: React.CSSProperties;
  if (mobile) {
    const targetLow = hole && hole.top > vp.h / 2;
    cardStyle = targetLow ? { left: 12, right: 12, top: 12 } : { left: 12, right: 12, bottom: 12 };
  } else if (!hole) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 440 };
  } else {
    const spaceBelow = vp.h - (hole.top + hole.height);
    const spaceRight = vp.w - (hole.left + hole.width);
    if (spaceBelow > 230) {
      cardStyle = { top: hole.top + hole.height + 12, left: Math.min(Math.max(16, hole.left), vp.w - CARD_W - 16), width: CARD_W };
    } else if (hole.top > 230) {
      cardStyle = { top: hole.top - 12, left: Math.min(Math.max(16, hole.left), vp.w - CARD_W - 16), width: CARD_W, transform: "translateY(-100%)" };
    } else if (spaceRight > CARD_W + 24) {
      // Tall targets such as sidebar items near the top: place beside them.
      cardStyle = { top: Math.max(16, Math.min(hole.top, vp.h - 260)), left: hole.left + hole.width + 12, width: CARD_W };
    } else {
      cardStyle = { left: "50%", bottom: 16, transform: "translateX(-50%)", width: CARD_W };
    }
  }

  const counted = hasIntro ? steps.length - 1 : steps.length;
  const position = hasIntro ? index : index + 1;

  return (
    <div className="fixed inset-0 z-[450] font-jakarta">
      <div className="absolute inset-0" onClick={finish} aria-hidden style={hole ? undefined : { background: "rgb(0 0 0 / .5)" }} />
      {hole && (
        <div
          aria-hidden
          className="absolute rounded-[14px] pointer-events-none transition-all duration-300 motion-reduce:transition-none"
          style={{ ...hole, boxShadow: "0 0 0 9999px rgb(0 0 0 / .5), 0 0 0 2px #A50F15" }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        className="absolute bg-white dark:bg-gray-900 rounded-[14px] shadow-2xl p-5 border border-gray-200 dark:border-gray-800"
        style={cardStyle}
      >
        <div className="flex items-start gap-3">
          <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-[#A50F15]">
            {hasIntro && index === 0 ? tour.label : `Step ${position} of ${counted}`}
          </p>
          <button onClick={finish} className={`${btnGhost} -mt-2 -mr-2`} aria-label="Close tour">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h2 id="guide-title" className="portal-section-title text-lg mt-1">{step.title}</h2>
        <p id="guide-body" className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed">{step.body}</p>

        <div className="mt-4 flex items-center gap-2">
          <span className="flex flex-wrap gap-1.5 flex-1" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[#A50F15]" : "w-1.5 bg-gray-300 dark:bg-gray-700"}`} />
            ))}
          </span>
          {index === 0 ? (
            <button onClick={finish} className={btnGhost}>Skip</button>
          ) : (
            <button onClick={() => setIndex((i) => i - 1)} className={btnGhost}>Back</button>
          )}
          <button ref={primaryRef} onClick={() => (isLast ? finish() : setIndex((i) => i + 1))} className={btnPrimary}>
            {hasIntro && index === 0 ? "Start tour" : isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
