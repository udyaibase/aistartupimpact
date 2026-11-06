'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION_MS = 340;
/** How far, or how fast, the sheet must be dragged for letting go to close it. */
const CLOSE_DISTANCE = 96;
const CLOSE_VELOCITY = 0.6;

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** The content handles its own padding and scrolling (for screens that slide inside the sheet). */
  flush?: boolean;
}

/**
 * A native-style sheet: slides up from the bottom and back down, and follows the finger when dragged by its top.
 * Only `transform` and `opacity` animate, so it stays smooth on phones. Portaled, because a transformed parent
 * (like a sticky bar) would otherwise trap a fixed overlay inside it.
 */
export default function BottomSheet({ open, onClose, title, headerAction, footer, children, flush }: Props) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragging = useRef<{ startY: number; startTime: number; lastY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stay mounted through the closing animation, and start the opening one a frame after mounting.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setDragY(0);
      let inner = 0;
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setVisible(true)); });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    setVisible(false);
    const t = setTimeout(() => { setMounted(false); setDragY(0); }, DURATION_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea')).filter((el) => !el.closest('[inert]'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = { startY: e.clientY, startTime: e.timeStamp, lastY: e.clientY };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current.lastY = e.clientY;
    setDragY(Math.max(0, e.clientY - dragging.current.startY));
  }, []);
  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    dragging.current = null;
    const distance = d.lastY - d.startY;
    const velocity = distance / Math.max(1, e.timeStamp - d.startTime);
    if (distance > CLOSE_DISTANCE || (distance > 12 && velocity > CLOSE_VELOCITY)) onCloseRef.current();
    else setDragY(0);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;
  const isDragging = dragging.current !== null;

  return createPortal(
    <div className="fixed inset-0 z-modal">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/40 motion-reduce:transition-none"
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${DURATION_MS}ms ${EASE}` }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex flex-col max-h-[85dvh] rounded-t-[20px] bg-white dark:bg-gray-900 shadow-2xl outline-none will-change-transform motion-reduce:transition-none"
        style={{
          transform: visible ? `translate3d(0, ${dragY}px, 0)` : 'translate3d(0, 100%, 0)',
          transition: isDragging ? 'none' : `transform ${DURATION_MS}ms ${EASE}`,
        }}
      >
        {/* The drag area: touch-none hands the gesture to the sheet instead of the page. */}
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} className="shrink-0 touch-none cursor-grab active:cursor-grabbing select-none">
          <div className="flex justify-center pt-2.5 pb-1.5"><span aria-hidden className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" /></div>
          <div className="flex items-center gap-2 pl-4 pr-2 pb-2 border-b border-gray-100 dark:border-gray-800">
            <h2 className="flex-1 min-w-0 font-sora font-semibold text-[17px] text-navy dark:text-white truncate">{title}</h2>
            {headerAction}
            <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 dark:active:bg-gray-800 transition-colors">
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className={flush ? 'flex-1 min-h-0' : 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4'}>{children}</div>
        {footer && (
          <div className="shrink-0 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-gray-100 dark:border-gray-800">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
