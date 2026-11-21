'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Crop, ImagePlus, Loader2, RotateCcw, Scissors, Trash2, Upload, X } from 'lucide-react';

/**
 * An image field for logos and signatures: drop a file on it, paste one, or browse. Before it is uploaded the
 * picture opens in a cropper where the host drags the corners to keep just the part they want, sees the result as
 * they go, and can make a white background see-through (a scanned signature on white paper is the usual case).
 * The saved file is a PNG, so see-through areas stay see-through.
 *
 * It uploads nothing itself: `onPick` receives the finished file and the form decides where it goes.
 */

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
/** Longest side of the saved picture. Plenty for print at the size a logo or signature appears. */
const MAX_SIDE = 900;
const CHECKER = 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 14px 14px';

type Box = { x: number; y: number; w: number; h: number }; // in the picture's own pixels
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Why a file can't be used, in the host's words; empty when it can. */
export function imageFileProblem(file: { type: string; size: number }): string {
  if (!TYPES.includes(file.type)) return 'Use a PNG, JPG or WebP image.';
  if (file.size > MAX_BYTES) return 'That image is larger than 5 MB. Use a smaller one.';
  return '';
}

/** How see-through a pixel becomes when white is removed: white fully, near-white partly, anything darker not at all. */
export function whiteToAlpha(r: number, g: number, b: number, a: number): number {
  const light = Math.min(r, g, b); // the darkest channel decides: coloured ink keeps its colour
  if (light >= 245) return 0;
  if (light <= 200) return a;
  return Math.round(a * ((245 - light) / 45));
}

/** The smallest box holding everything that isn't empty (see-through or white). Null for a blank picture. */
export function contentBox(data: Uint8ClampedArray, width: number, height: number): Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      if (data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(width, height) * 0.01);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Draws the chosen part of the picture, at most `maxSide` on its long side, optionally with white made see-through. */
function drawCrop(img: HTMLImageElement, box: Box, maxSide: number, removeWhite: boolean): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(box.w, box.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.w * scale));
  canvas.height = Math.max(1, Math.round(box.h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  if (removeWhite) {
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < px.data.length; i += 4) px.data[i + 3] = whiteToAlpha(px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]);
    ctx.putImageData(px, 0, 0);
  }
  return canvas;
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: { id: Exclude<Handle, 'move'>; at: string; cursor: string }[] = [
  { id: 'nw', at: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { id: 'n', at: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'ns-resize' },
  { id: 'ne', at: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { id: 'e', at: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', at: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
  { id: 's', at: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'ns-resize' },
  { id: 'sw', at: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { id: 'w', at: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
];

function CropDialog({ file, title, defaultRemoveWhite, onCancel, onDone }: {
  file: File; title: string; defaultRemoveWhite: boolean; onCancel: () => void; onDone: (file: File) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [box, setBox] = useState<Box | null>(null);
  const [removeWhite, setRemoveWhite] = useState(defaultRemoveWhite);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState({ w: 440, h: 280 });
  const drag = useRef<{ id: number; handle: Handle; startX: number; startY: number; from: Box } | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const trimmed = useRef<Box | null>(null);

  useEffect(() => {
    let live = true;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      if (!live) return;
      setImg(im);
      // Start on the picture's content: most logo and signature files carry empty edges.
      const c = document.createElement('canvas');
      const k = Math.min(1, 600 / Math.max(im.naturalWidth, im.naturalHeight));
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(im, 0, 0, c.width, c.height);
      const found = contentBox(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      const whole = { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
      trimmed.current = found ? { x: Math.round(found.x / k), y: Math.round(found.y / k), w: Math.min(im.naturalWidth, Math.round(found.w / k)), h: Math.min(im.naturalHeight, Math.round(found.h / k)) } : whole;
      setBox(trimmed.current);
    };
    im.onerror = () => { if (live) setError('This image can’t be opened. Try a PNG or JPG.'); };
    im.src = url;
    return () => { live = false; im.onload = null; im.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    const fit = () => setStage({ w: Math.max(240, Math.min(460, window.innerWidth - 64)), h: Math.max(180, Math.min(300, window.innerHeight - 420)) });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => { firstRef.current?.focus(); }, [img]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // The picture is shown as large as fits the stage; `shown` is one picture pixel in screen pixels.
  const shown = img ? Math.min(stage.w / img.naturalWidth, stage.h / img.naturalHeight) : 1;
  const viewW = img ? img.naturalWidth * shown : stage.w;
  const viewH = img ? img.naturalHeight * shown : stage.h;

  // The result, redrawn as the box moves.
  useEffect(() => {
    if (!img || !box || !previewRef.current) return;
    const frame = requestAnimationFrame(() => {
      const out = drawCrop(img, box, 260, removeWhite);
      const el = previewRef.current!;
      el.width = out.width; el.height = out.height;
      el.getContext('2d')!.drawImage(out, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [img, box, removeWhite]);

  const reshape = useCallback((from: Box, handle: Handle, dx: number, dy: number): Box => {
    if (!img) return from;
    const W = img.naturalWidth, H = img.naturalHeight, MIN = Math.max(8, Math.round(Math.max(W, H) * 0.03));
    if (handle === 'move') return { ...from, x: clamp(from.x + dx, 0, W - from.w), y: clamp(from.y + dy, 0, H - from.h) };
    let { x, y, w, h } = from;
    if (handle.includes('w')) { const nx = clamp(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
    if (handle.includes('e')) w = clamp(w + dx, MIN, W - x);
    if (handle.includes('n')) { const ny = clamp(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
    if (handle.includes('s')) h = clamp(h + dy, MIN, H - y);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }, [img]);

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    if (!box) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, handle, startX: e.clientX, startY: e.clientY, from: box };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setBox(reshape(d.from, d.handle, (e.clientX - d.startX) / shown, (e.clientY - d.startY) / shown));
  };
  const end = (e: React.PointerEvent) => { if (drag.current?.id === e.pointerId) drag.current = null; };

  // Arrow keys move the box; with Shift they grow or shrink it from the bottom-right corner.
  const onKey = (e: React.KeyboardEvent) => {
    if (!box || !img) return;
    const step = Math.max(1, Math.round(Math.max(img.naturalWidth, img.naturalHeight) * 0.01));
    const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!(e.key in dir)) return;
    e.preventDefault();
    setBox(reshape(box, e.shiftKey ? 'se' : 'move', dir[e.key][0], dir[e.key][1]));
  };

  const save = () => {
    if (!img || !box) return;
    setSaving(true);
    drawCrop(img, box, MAX_SIDE, removeWhite).toBlob((blob) => {
      setSaving(false);
      if (!blob) { setError('Couldn’t prepare the image. Try another file.'); return; }
      onDone(new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'image'}.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  const whole = img ? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight } : null;
  const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full sm:max-w-[560px] max-h-[100dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" aria-hidden /></button>
        </div>
        <p className="px-5 text-sm text-gray-600 dark:text-gray-400">Drag the corners to keep just the part you want. The result below updates as you go.</p>

        <div className="px-5 py-3">
          {error ? (
            <p role="alert" className="py-10 text-center text-sm text-red-600">{error}</p>
          ) : !img || !box ? (
            <div className="grid place-items-center" style={{ height: stage.h }}><Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden /></div>
          ) : (
            <div className="mx-auto relative select-none touch-none rounded-md" style={{ width: viewW, height: viewH, background: CHECKER }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
              {/* Everything outside the box is dimmed by the box's own very large shadow. */}
              <div className="absolute inset-0 overflow-hidden rounded-md pointer-events-none">
                <div className="absolute" style={{ left: box.x * shown, top: box.y * shown, width: box.w * shown, height: box.h * shown, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)' }} />
              </div>
              <div role="slider" tabIndex={0} aria-label="Crop area. Arrow keys move it; Shift with arrow keys changes its size." aria-valuetext={`${box.w} by ${box.h} pixels`} aria-valuenow={box.w} aria-valuemin={1} aria-valuemax={img.naturalWidth}
                onKeyDown={onKey} onPointerDown={start('move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
                className="absolute cursor-move outline-none ring-2 ring-white focus-visible:ring-brand"
                style={{ left: box.x * shown, top: box.y * shown, width: box.w * shown, height: box.h * shown, boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.6)' }}>
                {HANDLES.map((h) => (
                  <span key={h.id} onPointerDown={start(h.id)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-hidden
                    className={`absolute ${h.at} w-7 h-7 grid place-items-center`} style={{ cursor: h.cursor }}>
                    <span className="block w-3 h-3 rounded-sm bg-white border border-gray-700 shadow" />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {img && box && !error && (
          <>
            <div className="px-5 flex flex-wrap items-center gap-2">
              <button ref={firstRef} type="button" className={btn} onClick={() => trimmed.current && setBox(trimmed.current)}><Scissors className="w-4 h-4" aria-hidden /> Trim empty edges</button>
              <button type="button" className={btn} onClick={() => whole && setBox(whole)}><RotateCcw className="w-4 h-4" aria-hidden /> Whole image</button>
              <label className="ml-auto flex items-center gap-2 min-h-[40px] cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                <input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
                Make white see-through
              </label>
            </div>
            <div className="px-5 pt-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Result, on light and dark</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-24 rounded-md border border-gray-200 dark:border-gray-700 bg-[#FDFAF4] grid place-items-center p-2 overflow-hidden"><canvas ref={previewRef} className="max-w-full max-h-full" aria-label="Result on a light background" /></div>
                <DarkCopy source={previewRef} deps={[box, removeWhite, img]} />
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end px-5 py-4">
          <button type="button" onClick={onCancel} className={btn}>Cancel</button>
          <button type="button" onClick={save} disabled={!img || !box || !!error || saving}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Crop className="w-4 h-4" aria-hidden />} Use this image
          </button>
        </div>
      </div>
    </div>
  );
}

/** The same result on a dark background, so a see-through logo can be judged on both. */
function DarkCopy({ source, deps }: { source: React.RefObject<HTMLCanvasElement | null>; deps: unknown[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const from = source.current, to = ref.current;
      if (!from || !to || !from.width) return;
      to.width = from.width; to.height = from.height;
      to.getContext('2d')!.drawImage(from, 0, 0);
    }));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <div className="h-24 rounded-md border border-gray-700 bg-[#0D182E] grid place-items-center p-2 overflow-hidden"><canvas ref={ref} className="max-w-full max-h-full" aria-label="Result on a dark background" /></div>;
}

export default function ImageDropField({ label, value, onPick, onRemove, busy = false, hint, removeWhiteByDefault = false, cropTitle }: {
  label: string;
  /** The saved picture's address, or null when there is none. */
  value: string | null;
  /** The cropped PNG, ready to upload. */
  onPick: (file: File) => void;
  onRemove: () => void;
  busy?: boolean;
  hint?: string;
  /** Start with "Make white see-through" on: right for signatures. */
  removeWhiteByDefault?: boolean;
  cropTitle?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState<File | null>(null);

  const take = (file: File | undefined | null) => {
    if (!file) return;
    const wrong = imageFileProblem(file);
    setProblem(wrong);
    if (!wrong) setPending(file);
  };

  return (
    <div>
      <p id={`${id}-label`} className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">{label}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
        onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); take(f); } }}
        className={`rounded-[12px] border-2 border-dashed transition-colors ${over ? 'border-brand bg-brand/5' : 'border-gray-300 dark:border-gray-700'} ${value ? 'p-2.5' : 'p-0'}`}>
        <input ref={inputRef} id={`${id}-file`} type="file" accept={TYPES.join(',')} className="sr-only" aria-labelledby={`${id}-label`} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
        {value ? (
          <div className="flex items-center gap-3">
            <div className="h-16 w-28 shrink-0 rounded-md border border-gray-200 dark:border-gray-700 grid place-items-center p-1.5 overflow-hidden" style={{ background: CHECKER }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Upload className="w-4 h-4" aria-hidden />} Replace
              </button>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">or drop a new image here</p>
            </div>
            <button type="button" onClick={onRemove} disabled={busy} aria-label={`Remove ${label.toLowerCase()}`} title={`Remove ${label.toLowerCase()}`}
              className="w-10 h-10 shrink-0 grid place-items-center rounded-[10px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50">
              <Trash2 className="w-[18px] h-[18px]" aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="w-full min-h-[96px] px-4 py-4 flex flex-col items-center justify-center gap-1 rounded-[10px] text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-hidden /> : <ImagePlus className="w-5 h-5 text-gray-400" aria-hidden />}
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{over ? 'Drop it here' : 'Drag an image here, or browse'}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG or WebP, up to 5 MB. You can crop it next.</span>
          </button>
        )}
      </div>
      {problem && <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400">{problem}</p>}
      {hint && !problem && <p className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">{hint}</p>}
      {pending && (
        <CropDialog file={pending} title={cropTitle ?? `Crop ${label.toLowerCase()}`} defaultRemoveWhite={removeWhiteByDefault}
          onCancel={() => setPending(null)} onDone={(file) => { setPending(null); onPick(file); }} />
      )}
    </div>
  );
}
