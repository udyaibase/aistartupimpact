import { NextRequest, NextResponse } from 'next/server';
import { buildSampleInvoicePdf, freezeIssuedInvoiceSellers } from '@/lib/billing/invoice';
import { INVOICE_PRODUCTS, invoicePrefix, loadInvoiceSettings, sanitizeInvoiceSettings, sellerFrom, type InvoiceProduct } from '@/lib/billing/seller';
import { internalAuthorized } from '@/lib/internal-auth';

export const dynamic = 'force-dynamic';

/**
 * Called by the admin app's Billing → Invoice settings screen (Bearer INTERNAL_API_SECRET).
 *
 * - { action: 'status' }: which details invoices use today, and whether each comes from the saved screen or a
 *   server setting. Lets the admin show what an empty field falls back to.
 * - { action: 'preview', settings, product }: a sample invoice PDF built from the draft settings. Nothing is saved.
 * - { action: 'freeze' }: freeze today's seller details onto invoices already issued, before new ones are saved.
 */
export async function POST(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  if (body.action === 'status') {
    const saved = await loadInvoiceSettings();
    const live = sellerFrom(saved);
    const fallback = sellerFrom({});
    return NextResponse.json({
      enabled: !!live,
      // What each field would be with nothing saved: the server settings.
      fallback: fallback
        ? { sellerName: fallback.name, gstin: fallback.gstin, address: fallback.address, email: fallback.email, phone: fallback.phone ?? '', website: fallback.website ?? '', cin: fallback.cin ?? '', sac: fallback.sac, prefix: fallback.prefix }
        : { prefix: invoicePrefix() },
    });
  }

  if (body.action === 'preview') {
    const product: InvoiceProduct = (INVOICE_PRODUCTS as readonly string[]).includes(body.product) ? body.product : 'employer';
    const seller = sellerFrom(sanitizeInvoiceSettings(body.settings));
    if (!seller) return NextResponse.json({ error: 'Add the seller name, a valid GSTIN, the address and a SAC code to see a preview.' }, { status: 422 });
    const pdf = await buildSampleInvoicePdf(seller, product);
    return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store' } });
  }

  if (body.action === 'freeze') {
    const r = await freezeIssuedInvoiceSellers();
    return 'error' in r ? NextResponse.json({ frozen: 0, skipped: r.error }) : NextResponse.json(r);
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}
