'use client';

import { useMemo } from 'react';
import { CERTIFICATE_PAGE, CERTIFICATE_THEMES, TECH_BAND_HOST, type Triple } from '@/lib/events/certificate-themes';
import type { CertificateTemplate } from '@/lib/events/after-event';
import { fillMarkers, qrBox, sampleMarkerValues, viewBoxOf } from '@/lib/events/certificate-custom';

/**
 * The certificate as the host is designing it, redrawn on every keystroke. It follows the PDF's own layout
 * (lib/events/certificate-pdf.ts): same page, same positions, same colours, in SVG instead of PDF. Positions below
 * are in PDF points with y measured from the bottom, as in that file, so the two can be compared line by line.
 * It is a close likeness, not the file itself: "Preview PDF" still opens the real thing.
 */

const { width: W, height: H, techBand: BAND } = CERTIFICATE_PAGE;
const SERIF = '"Times New Roman", Times, serif';
const SANS = 'Helvetica, Arial, sans-serif';
const css = (c: Triple) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

export interface CertificatePreviewProps {
  template: CertificateTemplate;
  title: string;
  /** "participated in", "successfully completed"… */
  phrase: string;
  description: string;
  skills: string[];
  dateLine: string;
  eventTitle: string;
  hostName: string;
  logoUrl: string | null;
  signerName: string;
  signerTitle: string;
  signatureUrl: string | null;
  /** The name printed as an example. */
  sampleName?: string;
  partnerLogoUrl?: string | null;
  logoPosition?: 'center' | 'left' | 'right';
  logoSize?: 'small' | 'medium' | 'large';
  showHostName?: boolean;
  /** The host's own design (SVG code), shown when template is "custom". */
  customSvg?: string;
  duration?: string;
}

const LOGO_HEIGHT = { small: 38, medium: 56, large: 74 } as const;
const LOGO_BOX = 120; // each logo is fitted into a box this wide

/** The logo and partner logo in a row, as the PDF places them. `top` is the row's top edge in PDF points. */
function Logos({ urls, position, height, top, box = LOGO_BOX }: { urls: string[]; position: 'center' | 'left' | 'right'; height: number; top: number; box?: number }) {
  if (!urls.length) return null;
  const gap = 22;
  const LOGO_BOX = box;
  const total = urls.length * LOGO_BOX + gap * (urls.length - 1);
  const start = position === 'left' ? 72 : position === 'right' ? W - 72 - total : (W - total) / 2;
  const align = urls.length > 1 ? 'xMidYMid' : position === 'left' ? 'xMinYMid' : position === 'right' ? 'xMaxYMid' : 'xMidYMid';
  return <>{urls.map((url, i) => <image key={url + i} href={url} x={start + i * (LOGO_BOX + gap)} y={H - top} width={LOGO_BOX} height={height} preserveAspectRatio={`${align} meet`} />)}</>;
}

/**
 * A host's own design in the preview: their code as a picture, with example values in the markers. It is shown as an
 * image, where a browser runs no scripts and loads nothing from other sites, so pasted code is harmless here even
 * before the server has cleaned it.
 */
function CustomPreview(p: CertificatePreviewProps) {
  const svg = (p.customSvg ?? '').trim();
  const src = useMemo(() => {
    if (!/<svg[\s>]/i.test(svg)) return '';
    const filled = fillMarkers(svg, sampleMarkerValues({
      name: p.sampleName || 'Priya Sharma', event: p.eventTitle, date: p.dateLine, title: p.title || 'Certificate of Participation', host: p.hostName, phrase: p.phrase || 'participated in',
      description: p.description, topics: p.skills.map((k) => k.trim()).filter(Boolean).slice(0, 6).join('  ·  '), duration: p.duration ?? '',
      signer: p.signerName || p.hostName, signer_title: p.signerTitle || 'Organizer',
    }));
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(/<svg[^>]*\sxmlns\s*=/.test(filled) ? filled : filled.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
  }, [svg, p.sampleName, p.eventTitle, p.dateLine, p.title, p.hostName, p.phrase, p.description, p.skills, p.duration, p.signerName, p.signerTitle]);

  if (!src) {
    return (
      <div className="aspect-[842/595] grid place-items-center bg-gray-50 dark:bg-gray-800 text-center px-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">Paste your design’s SVG code below and it appears here.</p>
      </div>
    );
  }
  const box = qrBox(svg);
  const vb = viewBoxOf(svg);
  const size = box ? Math.min(120, Math.max(54, (box.size / vb.width) * W)) : 74;
  const x = box ? ((box.x - vb.x) / vb.width) * W : W - 90 - size;
  const yTop = box ? ((box.y - vb.y) / vb.height) * H : H - 86 - size;
  const logos = [p.logoUrl, p.partnerLogoUrl].filter((u): u is string => !!u);
  return (
    <div className="relative aspect-[842/595] bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Preview of your own certificate design" className="absolute inset-0 w-full h-full" />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden>
        <Logos urls={logos} position={p.logoPosition ?? 'center'} height={LOGO_HEIGHT[p.logoSize ?? 'medium']} top={H - 34} />
        <rect x={x - 12} y={yTop - 5} width={size + 24} height={size + 29} fill="#fff" />
        <QrPlaceholder x={x} y={yTop} size={size} dark={false} />
        <text x={x + size / 2} y={yTop + size + 11} textAnchor="middle" fontFamily={SANS} fontSize={6.5} fill="#4d4d54">ID SAMPLE0000000000</text>
        <text x={x + size / 2} y={yTop + size + 19} textAnchor="middle" fontFamily={SANS} fontSize={6} fill="#4d4d54">Verify: udyaibase.com/verify/…</text>
      </svg>
    </div>
  );
}

type Font = { family: string; weight: number; italic?: boolean };

let canvas: CanvasRenderingContext2D | null | undefined;
/** Width of text at a size. Measured in the browser; estimated when there is no browser (first render on the server). */
function widthOf(text: string, font: Font, size: number): number {
  if (canvas === undefined) canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!canvas) return text.length * size * (font.weight >= 700 ? 0.56 : 0.48);
  canvas.font = `${font.italic ? 'italic ' : ''}${font.weight} ${size}px ${font.family}`;
  return canvas.measureText(text).width;
}

/** Largest size (down to min) at which text fits the width: the PDF's own rule. */
function fit(text: string, font: Font, size: number, maxWidth: number, min = 10): number {
  let s = size;
  while (s > min && widthOf(text, font, s) > maxWidth) s -= 1;
  return s;
}

/** Split into at most two lines that fit: the PDF's own rule. */
function twoLines(text: string, font: Font, size: number, maxWidth: number): string[] {
  if (widthOf(text, font, size) <= maxWidth) return [text];
  let first = '';
  for (const word of text.split(' ')) {
    const next = first ? `${first} ${word}` : word;
    if (widthOf(next, font, size) > maxWidth) break;
    first = next;
  }
  const rest = text.slice(first.length).trim();
  return first ? [first, rest] : [text];
}

type Line = { text: string; y: number; size: number; font: Font; fill: string; spacing?: number };

function Seal({ cx, cy, fill, mark, ribbon }: { cx: number; cy: number; fill: string; mark: string; ribbon: boolean }) {
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 11.5 : 4.8;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    return `${i === 0 ? 'M' : 'L'} ${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
  return (
    <g transform={`translate(${cx} ${H - cy})`}>
      {ribbon && (
        <>
          <path d="M -15 0 L -3 0 L -8 46 L -15 37 L -23 44 Z" fill={fill} opacity={0.88} />
          <path d="M 3 0 L 15 0 L 23 44 L 15 37 L 8 46 Z" fill={fill} opacity={0.88} />
        </>
      )}
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return <circle key={i} cx={(Math.cos(a) * 26).toFixed(2)} cy={(Math.sin(a) * 26).toFixed(2)} r={3.6} fill={fill} />;
      })}
      <circle r={26} fill={fill} />
      <circle r={20.5} fill="none" stroke={mark} strokeWidth={0.9} opacity={0.9} />
      <path d={`${star} Z`} fill={mark} />
    </g>
  );
}

/** Stands in for the QR code: the real one is made when the certificate is issued. */
function QrPlaceholder({ x, y, size, dark }: { x: number; y: number; size: number; dark: boolean }) {
  const n = 21;
  const cell = size / n;
  const cells: React.ReactNode[] = [];
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let on: boolean;
      if (finder(r, c)) {
        const rr = r >= n - 7 ? r - (n - 7) : r;
        const cc = c >= n - 7 ? c - (n - 7) : c;
        on = rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
      } else {
        on = (r * 7 + c * 13 + ((r * c) % 5)) % 3 === 0; // a fixed, even-looking pattern
      }
      if (on) cells.push(<rect key={`${r}-${c}`} x={x + c * cell} y={y + r * cell} width={cell + 0.15} height={cell + 0.15} fill="#111" />);
    }
  }
  return (
    <g aria-hidden>
      {dark && <rect x={x - 5} y={y - 5} width={size + 10} height={size + 10} fill="#fff" />}
      {cells}
    </g>
  );
}

export default function CertificatePreview(p: CertificatePreviewProps) {
  if (p.template === 'custom') return <CustomPreview {...p} />;
  return <BuiltInPreview {...p} />;
}

function BuiltInPreview(p: CertificatePreviewProps) {
  const t = CERTIFICATE_THEMES[p.template] ?? CERTIFICATE_THEMES.classic;
  const ink = css(t.ink);
  const muted = css(t.muted);
  const accent = css(t.accent);
  const accent2 = css(t.accent2 ?? t.accent);
  const inBand = p.template === 'tech';

  const body: Font = { family: t.serif ? SERIF : SANS, weight: 400 };
  const heading: Font = t.serif ? { family: SERIF, weight: 400 } : { family: SANS, weight: 700 };
  const nameFont: Font = t.serif ? { family: SERIF, weight: 700, italic: true } : { family: SANS, weight: 700 };
  const sansBold: Font = { family: SANS, weight: 700 };
  const sans: Font = { family: SANS, weight: 400 };

  const description = p.description.trim().replace(/\s+/g, ' ');
  const skills = p.skills.map((k) => k.trim()).filter(Boolean).slice(0, 6);
  const full = !!description || skills.length > 0;
  const logos = [p.logoUrl, p.partnerLogoUrl].filter((u): u is string => !!u);
  const logoPosition = p.logoPosition ?? 'center';
  const centred = logos.length > 0 && logoPosition === 'center';
  const logoHeight = centred ? Math.max(30, LOGO_HEIGHT[p.logoSize ?? 'medium'] - (full ? 16 : 0)) : Math.min(LOGO_HEIGHT[p.logoSize ?? 'medium'], 44);

  // The same walk down the page as the PDF.
  const { lines, ruleY, logoTop } = useMemo(() => {
    const out: Line[] = [];
    let y = H - 78;
    let logoAt: number | null = null;
    const host = p.hostName.toUpperCase();
    const hostLine = (size: number) => out.push({ text: host, y, size: fit(host, sansBold, size, 520), font: sansBold, fill: inBand ? css(TECH_BAND_HOST) : muted });
    if (centred) {
      logoAt = y + 18;
      y -= logoHeight + 6;
      if (p.showHostName) { y += 4; hostLine(10); y -= 14; }
    } else {
      if (logos.length) logoAt = H - 48;
      if (!logos.length || p.showHostName) hostLine(13);
      y -= 20;
    }
    const title = (p.title || 'Certificate of Participation').toUpperCase();
    y -= 34;
    out.push({ text: title, y, size: fit(title, heading, t.serif ? 30 : 26, 680), font: heading, fill: inBand ? '#fff' : ink });
    y -= 16;
    const rule = y;
    if (inBand) y = Math.min(y, H - BAND - 5);

    y -= full ? 32 : 38;
    out.push({ text: 'This is to certify that', y, size: 13, font: body, fill: muted });
    const name = p.sampleName || 'Your Attendee Name';
    y -= full ? 44 : 50;
    out.push({ text: name, y, size: fit(name, nameFont, full ? 36 : 40, 640, 18), font: nameFont, fill: ink });
    y -= full ? 30 : 34;
    out.push({ text: p.phrase || 'participated in', y, size: 13, font: body, fill: muted });
    for (const line of twoLines(p.eventTitle, sansBold, 18, 640).slice(0, 2)) {
      y -= 26;
      out.push({ text: line, y, size: fit(line, sansBold, 18, 640, 11), font: sansBold, fill: ink });
    }
    y -= 22;
    out.push({ text: p.dateLine, y, size: fit(p.dateLine, body, 12, 600), font: body, fill: muted });
    if (description) {
      y -= 6;
      for (const line of twoLines(description, body, 11.5, 430).slice(0, 2)) {
        y -= 15;
        out.push({ text: line, y, size: fit(line, body, 11.5, 430, 8), font: body, fill: ink });
      }
    }
    if (skills.length) {
      y -= 21;
      out.push({ text: 'TOPICS COVERED', y, size: 6.5, font: sansBold, fill: accent2, spacing: 2.6 });
      for (const line of twoLines(skills.join('   ·   '), sansBold, 10, 400).slice(0, 2)) {
        y -= 15;
        out.push({ text: line, y, size: fit(line, sansBold, 10, 400, 7.5), font: sansBold, fill: ink });
      }
    }
    return { lines: out, ruleY: rule, logoTop: logoAt };
    // The fonts and colours all follow from the template, so the listed values are everything that can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.template, p.title, p.phrase, p.eventTitle, p.dateLine, p.hostName, logos.join('|'), logoPosition, p.logoSize, p.showHostName, p.sampleName, description, skills.join('|')]);

  const sigX = 90;
  const lineY = 112;
  const qrSize = 74;
  const qrX = W - 90 - qrSize;
  const below = t.dark ? 6 : 0;
  const signer = p.signerName || p.hostName;
  const signerTitle = p.signerTitle || 'Organizer';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Preview of the certificate in the ${p.template} design`} className="block w-full h-auto" style={{ background: css(t.bg) }}>
      <rect width={W} height={H} fill={css(t.bg)} />

      {/* Frame */}
      {p.template === 'classic' && (
        <>
          <rect x={22} y={22} width={W - 44} height={H - 44} fill="none" stroke={accent} strokeWidth={2.5} />
          <rect x={32} y={32} width={W - 64} height={H - 64} fill="none" stroke={accent} strokeWidth={0.8} />
        </>
      )}
      {p.template === 'modern' && (
        <>
          <rect x={0} y={0} width={14} height={H} fill={accent} />
          <rect x={14} y={0} width={W - 14} height={6} fill={ink} />
        </>
      )}
      {p.template === 'minimal' && <rect x={30} y={30} width={W - 60} height={H - 60} fill="none" stroke={accent} strokeWidth={0.6} />}
      {p.template === 'executive' && (
        <>
          <rect x={20} y={20} width={W - 40} height={H - 40} fill="none" stroke={accent} strokeWidth={1.6} />
          <rect x={27} y={27} width={W - 54} height={H - 54} fill="none" stroke={accent} strokeWidth={0.5} />
          {([[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]] as const).map(([x, y, dx, dy]) => (
            <path key={`${x}-${y}`} d={`M ${x + dx * 44} ${y} L ${x} ${y} L ${x} ${y + dy * 44}`} fill="none" stroke={accent} strokeWidth={2.2} />
          ))}
        </>
      )}
      {p.template === 'heritage' && (
        <>
          <rect x={18} y={18} width={W - 36} height={H - 36} fill="none" stroke={accent} strokeWidth={3} />
          <rect x={26} y={26} width={W - 52} height={H - 52} fill="none" stroke={accent2} strokeWidth={1} />
          <rect x={32} y={32} width={W - 64} height={H - 64} fill="none" stroke={accent} strokeWidth={0.6} />
          {[[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 6} y={y - 6} width={12} height={12} fill={accent2} />)}
        </>
      )}
      {p.template === 'tech' && (
        <>
          <rect x={0} y={0} width={W} height={BAND} fill={ink} />
          <rect x={0} y={BAND} width={W} height={5} fill={accent} />
          <path d={`M 0 ${H} L 170 ${H} L 0 ${H - 120} Z`} fill={accent} opacity={0.1} />
          <path d={`M ${W} ${H} L ${W - 230} ${H} L ${W} ${H - 150} Z`} fill={ink} opacity={0.06} />
        </>
      )}

      {/* The host's logo is their own upload, shown as it is. */}
      {logoTop !== null && <Logos urls={logos} position={logoPosition} height={logoHeight} top={logoTop} box={centred ? undefined : 110} />}

      <line x1={W / 2 - 60} x2={W / 2 + 60} y1={H - ruleY} y2={H - ruleY} stroke={accent} strokeWidth={1.2} />

      {lines.map((l, i) => (
        <text key={i} x={W / 2} y={H - l.y} textAnchor="middle" fontFamily={l.font.family} fontWeight={l.font.weight} fontStyle={l.font.italic ? 'italic' : undefined} fontSize={l.size} fill={l.fill} letterSpacing={l.spacing}>
          {l.text}
        </text>
      ))}

      {p.template === 'executive' && <Seal cx={W / 2} cy={96} fill={accent} mark={css(t.bg)} ribbon={false} />}
      {p.template === 'heritage' && <Seal cx={W / 2} cy={104} fill={accent} mark={accent2} ribbon />}

      {/* Signature */}
      {p.signatureUrl && (
        <>
          {t.dark && <rect x={sigX + 4} y={H - (lineY + 58)} width={182} height={56} fill={ink} opacity={0.96} />}
          <image href={p.signatureUrl} x={sigX + 10} y={H - (lineY + 56)} width={170} height={52} preserveAspectRatio="xMidYMid meet" />
        </>
      )}
      <line x1={sigX} x2={sigX + 190} y1={H - lineY} y2={H - lineY} stroke={muted} strokeWidth={0.8} />
      <text x={sigX} y={H - (lineY - 16)} fontFamily={SANS} fontWeight={700} fontSize={fit(signer, sansBold, 11, 190, 8)} fill={ink}>{signer}</text>
      <text x={sigX} y={H - (lineY - 30)} fontFamily={SANS} fontSize={fit(signerTitle, sans, 9, 190, 7)} fill={muted}>{signerTitle}</text>

      {/* QR and ID */}
      <QrPlaceholder x={qrX} y={H - (lineY - 26) - qrSize} size={qrSize} dark={!!t.dark} />
      <text x={qrX + qrSize} y={H - (lineY - 40 - below)} textAnchor="end" fontFamily={SANS} fontSize={7.5} fill={muted}>ID SAMPLE0000000000</text>
      <text x={qrX + qrSize} y={H - (lineY - 51 - below)} textAnchor="end" fontFamily={SANS} fontSize={7.5} fill={muted}>Verify: udyaibase.com/verify/…</text>
    </svg>
  );
}
