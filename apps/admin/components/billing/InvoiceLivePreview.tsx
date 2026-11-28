'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLE, previewModel } from '@/lib/billing/invoice-preview';
import type { InvoiceField, InvoiceProduct, InvoiceSettings } from '@/lib/billing/invoice-settings';

const PAGE_W = 595; // A4 in PDF points, the same page the website draws on
const PAGE_H = 842;
const rs = (paise: number) => `Rs ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INK = '#12171f';
const MUTED = '#6b7380';
const RULE = '#d9dbe0';
const BRAND = '#a50f15';

/** A value from the form, or a marked gap where a required detail is still missing. */
function Val({ v, what }: { v: string; what: string }) {
  return v ? <>{v}</> : <span style={{ background: '#fef3c7', color: '#92400e', padding: '0 3px', borderRadius: 2 }}>{what} missing</span>;
}

/**
 * The sample invoice, redrawn on every keystroke. It is always a sheet of white paper, whatever the admin theme.
 * The layout follows the website's PDF line by line; "Preview PDF" gives the exact file.
 */
export default function InvoiceLivePreview({ draft, fallback, product }: {
  draft: InvoiceSettings;
  fallback: (Partial<Record<InvoiceField, string>> & { prefix?: string }) | null;
  product: InvoiceProduct;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  // Fixed for the life of the screen, so the picture doesn't jump while typing across a minute boundary.
  const [now] = useState(() => new Date());
  const m = useMemo(() => previewModel(draft, fallback, product, now), [draft, fallback, product, now]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / PAGE_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const meta: [string, string][] = [
    ['Invoice number', m.number],
    ['Invoice date', m.date],
    ...(m.period ? [['Service period', m.period] as [string, string]] : []),
    ['Place of supply', `${SAMPLE.buyer.stateName} (${SAMPLE.buyer.state})`],
    ['Reverse charge', 'No'],
  ];
  const small = { fontSize: 8, fontWeight: 700, color: MUTED, letterSpacing: 0.2 } as const;

  return (
    <div>
      <div ref={frame} className="relative w-full overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm bg-white" style={{ height: PAGE_H * scale }}
        role="img" aria-label={`Sample tax invoice from ${m.name || 'your company'}, SAC code ${m.sac || 'not set'}, total ${rs(SAMPLE.totalPaise)}`}>
        <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left', padding: '40px 48px 0', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 9, lineHeight: 1.38, color: INK, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: BRAND }}>TAX INVOICE</span>
            <span style={{ fontSize: 8.5, color: MUTED }}>SAMPLE - not a valid invoice</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6 }}><Val v={m.name} what="Legal name" /></div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 14 }}>
            <div style={{ width: 250 }}>
              <div style={small}>FROM</div>
              <div style={{ color: MUTED, marginTop: 3, overflowWrap: 'anywhere' }}><Val v={m.address} what="Registered address" /></div>
              <div>GSTIN <Val v={m.gstin} what="GSTIN" />{m.pan ? <>&nbsp;&nbsp;|&nbsp;&nbsp;PAN {m.pan}</> : null}</div>
              {m.sellerState && <div>State: {m.sellerState}</div>}
              {m.cin && <div>CIN {m.cin}</div>}
              <div style={{ color: MUTED, overflowWrap: 'anywhere' }}>{m.contact}</div>
            </div>
            <div style={{ width: 217 }}>
              {meta.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 8.5, color: MUTED, whiteSpace: 'nowrap' }}>{k}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: `0.6px solid ${RULE}`, marginTop: 10, paddingTop: 8 }}>
            <div style={small}>BILL TO</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3 }}>{SAMPLE.buyer.name}</div>
            {SAMPLE.buyer.lines.map((l) => <div key={l}>{l}</div>)}
            <div>State: {SAMPLE.buyer.stateName}, Code: {SAMPLE.buyer.state}</div>
            <div>{SAMPLE.buyer.tax}</div>
            <div style={{ color: MUTED }}>{SAMPLE.buyer.email}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '257px 60px 40px 1fr 1fr', background: '#f5f5f7', padding: '5px 6px', marginTop: 14, ...small }}>
            <span>DESCRIPTION</span><span>SAC</span><span>QTY</span><span style={{ textAlign: 'right' }}>RATE</span><span style={{ textAlign: 'right' }}>TAXABLE VALUE</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '257px 60px 40px 1fr 1fr', padding: '6px 6px 8px', fontSize: 9.5, borderBottom: `0.6px solid ${RULE}` }}>
            <span style={{ paddingRight: 8 }}>{m.line}</span>
            <span><Val v={m.sac} what="SAC" /></span>
            <span>1</span>
            <span style={{ textAlign: 'right' }}>{rs(SAMPLE.amountPaise)}</span>
            <span style={{ textAlign: 'right' }}>{rs(SAMPLE.amountPaise)}</span>
          </div>

          <div style={{ marginLeft: 292, marginTop: 10, fontSize: 9.5 }}>
            {[{ label: 'Taxable value', paise: SAMPLE.amountPaise }, ...m.tax].map((t) => (
              <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0 6px 4px 0' }}><span>{t.label}</span><span>{rs(t.paise)}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `0.6px solid ${RULE}`, padding: '6px 6px 0 0', marginTop: 2, fontSize: 10.5, fontWeight: 700 }}><span>Total</span><span>{rs(SAMPLE.totalPaise)}</span></div>
          </div>
          <div style={{ color: MUTED, marginTop: 8 }}>Amount in words: {SAMPLE.words}</div>

          <div style={{ borderTop: `0.6px solid ${RULE}`, marginTop: 10, paddingTop: 8 }}>
            <div style={small}>PAYMENT</div>
            <div style={{ marginTop: 3 }}>Paid in full on {m.date} via Razorpay&nbsp;&nbsp;|&nbsp;&nbsp;Payment ID {SAMPLE.paymentId}</div>
          </div>

          <div style={{ textAlign: 'right', marginTop: 22 }}>
            <div style={{ fontWeight: 700 }}>For <Val v={m.name} what="Legal name" /></div>
            <div style={{ fontSize: 8.5, color: MUTED, marginTop: 20 }}>Authorised signatory</div>
          </div>

          <div style={{ position: 'absolute', left: 48, right: 48, bottom: 38, fontSize: 8, color: MUTED }}>
            {m.footerNote && <div style={{ fontSize: 8.5, marginBottom: 8, overflowWrap: 'anywhere', maxHeight: 24, overflow: 'hidden' }}>{m.footerNote}</div>}
            <div style={{ borderTop: `0.6px solid ${RULE}`, paddingTop: 6 }}>This is a computer-generated invoice and does not require a physical signature.</div>
            <div>Questions? {m.email}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-xs" aria-live="polite">
        {m.missing.length > 0 && <p className="font-medium text-amber-800 dark:text-amber-300">Still missing: {m.missing.join(', ')}. No invoice is issued until these are set.</p>}
        {m.invalid.length > 0 && <p className="font-medium text-red-700 dark:text-red-400">Not complete yet: {m.invalid.join(', ')}.</p>}
        <p className="text-gray-600 dark:text-gray-400">
          {m.intra ? 'Seller and sample customer are both in Karnataka, so the tax shows as CGST and SGST.' : 'The seller’s state differs from the sample customer’s (Karnataka), so the tax shows as IGST.'} Real invoices follow each customer’s state.
        </p>
      </div>
    </div>
  );
}
