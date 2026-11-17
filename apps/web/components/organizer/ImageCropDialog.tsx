'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

/**
 * Crop a photo to a square before it's uploaded (speaker headshots). Drag to move, slider, wheel or +/- to zoom;
 * arrow keys move it too. The result is a square JPEG of `outputSize` pixels, so uploads are small and consistent.
 * No dependencies: the crop is drawn on a canvas in the browser.
 */
export default function ImageCropDialog({
  file, title = 'Adjust photo', round = true, outputSize = 512, onCancel, onCropped,
}: {
  file: File;
  title?: string;
  /** Show a round guide (how headshots appear); the saved image is still square. */
  round?: boolean;
  outputSize?: number;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [src, setSrc] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState(300);
  const [zoom, setZoom] = useState(1); // 1 = the photo just covers the frame
  const [pos, setPos] = useState({ x: 0, y: 0 }); // top-left of the photo inside the frame, in px
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // A load that was superseded (React runs effects twice in development, or a new file was picked) must not
    // report anything: revoking its URL makes it fail, which used to show "This image can't be opened".
    let current = true;
    const url = URL.createObjectURL(file);
    setError('');
    setImg(null);
    setSrc(url);
    const im = new Image();
    im.onload = () => { if (current) setImg(im); };
    im.onerror = () => { if (current) setError('This image can’t be opened. Try a JPG or PNG.'); };
    im.src = url;
    return () => {
      current = false;
      im.onload = null;
      im.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const fit = () => setView(Math.max(220, Math.min(340, window.innerWidth - 72)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  const base = img ? view / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : view;
  const h = img ? img.naturalHeight * scale : view;

  /** Keep the frame always covered by the photo. */
  const clamp = useCallback((p: { x: number; y: number }, ww = w, hh = h) => ({
    x: Math.min(0, Math.max(view - ww, p.x)),
    y: Math.min(0, Math.max(view - hh, p.y)),
  }), [view, w, h]);

  // Centre the photo when it loads or the frame resizes.
  useEffect(() => {
    if (!img) return;
    const s = (view / Math.min(img.naturalWidth, img.naturalHeight)) * zoom;
    setPos({ x: (view - img.naturalWidth * s) / 2, y: (view - img.naturalHeight * s) / 2 });
  }, [img, view]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Zoom around the centre of the frame. */
  const zoomTo = useCallback((next: number) => {
    if (!img) return;
    const z = Math.min(4, Math.max(1, next));
    const s0 = base * zoom;
    const s1 = base * z;
    const cx = (view / 2 - pos.x) / s0;
    const cy = (view / 2 - pos.y) / s0;
    setZoom(z);
    setPos(clamp({ x: view / 2 - cx * s1, y: view / 2 - cy * s1 }, img.naturalWidth * s1, img.naturalHeight * s1));
  }, [img, base, zoom, view, pos, clamp]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return; }
    const step = e.shiftKey ? 30 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key] && document.activeElement === frameRef.current) {
      e.preventDefault();
      setPos((p) => clamp({ x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] }));
    }
    if ((e.key === '+' || e.key === '=') && document.activeElement === frameRef.current) zoomTo(zoom + 0.2);
    if (e.key === '-' && document.activeElement === frameRef.current) zoomTo(zoom - 0.2);
  };

  async function save() {
    if (!img) return;
    setSaving(true);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError('Your browser can’t crop images. Try another browser.'); setSaving(false); return; }
    ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background instead of black
    ctx.fillRect(0, 0, outputSize, outputSize);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, view / scale, view / scale, 0, 0, outputSize, outputSize);
    canvas.toBlob((blob) => {
      setSaving(false);
      if (blob) onCropped(blob);
      else setError('Couldn’t crop this image. Try another one.');
    }, 'image/jpeg', 0.9);
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onKeyDown={onKey}>
      <div role="dialog" aria-modal="true" aria-labelledby="crop-title"
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl font-jakarta"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 id="crop-title" className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <p className="px-5 text-sm text-gray-500 dark:text-gray-400">Drag to position. Zoom to fit the face in the circle.</p>

        <div className="px-5 py-4 flex justify-center">
          {error ? (
            <p role="alert" className="py-16 text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
          ) : (
            <div
              ref={frameRef}
              tabIndex={0}
              role="img"
              aria-label="Photo crop area. Use arrow keys to move, plus and minus to zoom."
              className="relative overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 touch-none select-none cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              style={{ width: view, height: view }}
              onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
              onPointerMove={(e) => { const d = drag.current; if (d && d.id === e.pointerId) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })); }}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onWheel={(e) => zoomTo(zoom - e.deltaY * 0.002)}
            >
              {src && img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" draggable={false} className="absolute max-w-none pointer-events-none" style={{ left: pos.x, top: pos.y, width: w, height: h }} />
              )}
              {round && (
                <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ boxShadow: `0 0 0 ${view}px rgba(0,0,0,0.45)`, borderRadius: '9999px' }} />
              )}
            </div>
          )}
        </div>

        {!error && (
          <div className="px-5 flex items-center gap-3">
            <button type="button" onClick={() => zoomTo(zoom - 0.2)} aria-label="Zoom out" className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Minus className="w-4 h-4" aria-hidden /></button>
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-brand" />
            <button type="button" onClick={() => zoomTo(zoom + 0.2)} aria-label="Zoom in" className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Plus className="w-4 h-4" aria-hidden /></button>
          </div>
        )}

        <div className="px-5 pt-4 pb-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={save} disabled={!img || saving || !!error} className="min-h-[44px] px-4 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
