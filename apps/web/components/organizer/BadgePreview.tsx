'use client';

import { useEffect, useMemo, useState } from 'react';
import { PDFDocument, StandardFonts, type PDFFont, type PDFImage, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import { BADGE_LAYOUTS, drawBadge, type BadgeLayout, type BadgePerson, type Surface } from '@/lib/events/badge-draw';
import { drawable } from '@/lib/events/pdf-text';
import type { BadgeSettings } from '@/lib/events/badge-settings';

/**
 * The Badges page preview, drawn in the browser by the same code as the printed PDF (lib/events/badge-draw.ts), so
 * every change shows at once: no request, no waiting. Fonts (for measuring text), images and the sample QR code are
 * loaded once and kept, so redrawing is just arithmetic. Built-in templates only; a host's own uploaded design is
 * cleaned and drawn on the server.
 */

type Fonts = { bold: PDFFont; regular: PDFFont };
let fontsOnce: Promise<Fonts> | null = null;
const loadFonts = () => (fontsOnce ??= (async () => {
  const doc = await PDFDocument.create();
  return { bold: await doc.embedFont(StandardFonts.HelveticaBold), regular: await doc.embedFont(StandardFonts.Helvetica) };
})());

/** A stand-in for a PDF image: drawBadge only needs the size; the preview draws the picture by its address. */
type PreviewImage = { width: number; height: number; href: string };
const imageCache = new Map<string, Promise<PreviewImage | null>>();
function loadImage(href: string): Promise<PreviewImage | null> {
  let p = imageCache.get(href);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1, href });
      img.onerror = () => resolve(null);
      img.src = href;
    });
    imageCache.set(href, p);
  }
  return p;
}

const css = (c?: RGB) => (c ? `rgb(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)})` : '#000');

type El =
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { k: 'text'; x: number; y: number; size: number; bold: boolean; fill: string; text: string }
  | { k: 'image'; x: number; y: number; w: number; h: number; href: string; cover: boolean }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number };

export default function BadgePreview({ settings, layout, eventTitle, eventDate, logoUrl, sponsorLogoUrls, person, questionLabels, alt }: {
  settings: BadgeSettings;
  layout: BadgeLayout;
  eventTitle: string;
  eventDate: string;
  logoUrl: string | null;
  sponsorLogoUrls: string[];
  person: BadgePerson;
  questionLabels: Record<string, string>;
  alt: string;
}) {
  const [fonts, setFonts] = useState<Fonts | null>(null);
  const [qr, setQr] = useState<PreviewImage | null>(null);
  const [images, setImages] = useState<Record<string, PreviewImage | null>>({});

  useEffect(() => { void loadFonts().then(setFonts); }, []);
  useEffect(() => {
    if (!person.qrToken) return;
    void QRCode.toDataURL(person.qrToken, { margin: 0, width: 300, errorCorrectionLevel: 'M' }).then((href) => setQr({ width: 300, height: 300, href }));
  }, [person.qrToken]);

  // Images the current design uses: loaded once, then kept.
  const wanted = useMemo(() => [
    settings.showLogo ? logoUrl : null,
    settings.backgroundUrl,
    ...(settings.sponsorStrip ? sponsorLogoUrls.slice(0, 4) : []),
  ].filter((u): u is string => !!u), [settings.showLogo, settings.backgroundUrl, settings.sponsorStrip, logoUrl, sponsorLogoUrls]);
  useEffect(() => {
    let live = true;
    for (const u of wanted) {
      if (u in images) continue;
      void loadImage(u).then((img) => { if (live) setImages((m) => ({ ...m, [u]: img })); });
    }
    return () => { live = false; };
  }, [wanted, images]);

  const L = BADGE_LAYOUTS[layout === 'a4' ? 'a6' : layout];
  const [W, H] = L.page;

  const els = useMemo<El[]>(() => {
    if (!fonts) return [];
    const out: El[] = [];
    const bg = settings.backgroundUrl ? images[settings.backgroundUrl] ?? null : null;
    const surface = {
      drawRectangle: (o: { x: number; y: number; width: number; height: number; color?: RGB }) => out.push({ k: 'rect', x: o.x, y: H - o.y - o.height, w: o.width, h: o.height, fill: css(o.color) }),
      drawText: (text: string, o: { x: number; y: number; size: number; font: PDFFont; color?: RGB }) => out.push({ k: 'text', x: o.x, y: H - o.y, size: o.size, bold: o.font === fonts.bold, fill: css(o.color), text }),
      drawImage: (img: PreviewImage, o: { x: number; y: number; width: number; height: number }) => out.push({ k: 'image', x: o.x, y: H - o.y - o.height, w: o.width, h: o.height, href: img.href, cover: img === bg }),
      drawLine: (o: { start: { x: number; y: number }; end: { x: number; y: number }; thickness?: number; color?: RGB }) => out.push({ k: 'line', x1: o.start.x, y1: H - o.start.y, x2: o.end.x, y2: H - o.end.y, stroke: css(o.color), width: o.thickness ?? 1 }),
    } as unknown as Surface;
    const asImg = (u: string | null) => (u ? (images[u] ?? null) : null) as unknown as PDFImage | null;
    drawBadge(surface, { x0: 0, top: H, bw: W, bh: H, portrait: H > W }, person, {
      st: settings, bold: fonts.bold, regular: fonts.regular,
      title: drawable(fonts.bold, eventTitle), date: drawable(fonts.regular, eventDate),
      logo: settings.showLogo ? asImg(logoUrl) : null,
      background: bg as unknown as PDFImage | null,
      sponsorImgs: settings.sponsorStrip ? sponsorLogoUrls.slice(0, 4).map(asImg).filter((x): x is PDFImage => !!x) : [],
      qr: settings.fields.qr ? (qr as unknown as PDFImage | null) : null,
      questionLabels,
    });
    return out;
  }, [fonts, settings, images, qr, person, questionLabels, eventTitle, eventDate, logoUrl, sponsorLogoUrls, W, H]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} className="block w-full h-auto bg-white" fontFamily="Helvetica, Arial, sans-serif">
      <rect width={W} height={H} fill="#fff" />
      {els.map((e, i) => {
        switch (e.k) {
          case 'rect': return <rect key={i} x={e.x} y={e.y} width={e.w} height={e.h} fill={e.fill} />;
          case 'text': return <text key={i} x={e.x} y={e.y} fontSize={e.size} fontWeight={e.bold ? 700 : 400} fill={e.fill}>{e.text}</text>;
          case 'image': return <image key={i} href={e.href} x={e.x} y={e.y} width={e.w} height={e.h} preserveAspectRatio={e.cover ? 'xMidYMid slice' : 'none'} />;
          case 'line': return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.stroke} strokeWidth={e.width} />;
        }
      })}
    </svg>
  );
}
