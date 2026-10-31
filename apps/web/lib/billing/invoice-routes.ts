import { NextResponse } from 'next/server';
import { buildCreditNotePdf, buildInvoicePdf, emailInvoice, invoiceFilename, invoicesEnabled, issueCreditNote, issueInvoice, type InvoiceTable } from '@/lib/billing/invoice';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';

/** Shared by the employer and host invoice routes once the caller's account is known. */
const NOT_READY = () => NextResponse.json({ error: 'Invoices aren’t available yet. Email billing@udyaibase.com if you need one now.' }, { status: 503 });

export async function invoicePdfResponse(table: InvoiceTable, paymentId: string, ownerId: string) {
  if (!invoicesEnabled()) return NOT_READY();
  const inv = await issueInvoice(table, paymentId);
  if (!inv || inv.ownerId !== ownerId) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  const pdf = await buildInvoicePdf(inv);
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoiceFilename(inv.number)}"`, 'Cache-Control': 'private, no-store' },
  });
}

export async function invoiceEmailResponse(table: InvoiceTable, paymentId: string, ownerId: string) {
  if (!invoicesEnabled()) return NOT_READY();
  const { success } = await checkRateLimit(apiRateLimit, `invoice-email:${ownerId}`);
  if (!success) return NextResponse.json({ error: 'Too many emails. Try again in a minute.' }, { status: 429 });
  const inv = await issueInvoice(table, paymentId);
  if (!inv || inv.ownerId !== ownerId) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  const r = await emailInvoice(table, paymentId, { force: true });
  return r.ok ? NextResponse.json({ success: true, to: r.to }) : NextResponse.json({ error: r.error }, { status: 502 });
}

export async function creditNotePdfResponse(table: InvoiceTable, paymentId: string, ownerId: string) {
  if (!invoicesEnabled()) return NOT_READY();
  const cn = await issueCreditNote(table, paymentId);
  if (!cn || cn.invoice.ownerId !== ownerId) return NextResponse.json({ error: 'Credit note not found.' }, { status: 404 });
  const pdf = await buildCreditNotePdf(cn);
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoiceFilename(cn.number)}"`, 'Cache-Control': 'private, no-store' },
  });
}
