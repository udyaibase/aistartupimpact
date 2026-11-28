import { discountNote } from '@/lib/offers/discount';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { BILLING_SELECT, GSTIN_RE, formatBillingAddress, panFromGstin, profileFromRow, type BillingProfile } from '@/lib/billing/details';
import { GST_STATES } from '@/lib/billing/gst-states';
import { planSoldName } from '@/lib/employer/plans';
import { isPackKey, PACKS } from '@/lib/funding/packs';
import { freezeSeller, frozenSellerOf, loadSeller, type FrozenSeller, type InvoiceProduct, type Seller } from '@/lib/billing/seller';

const fundingPackName = (k: string) => (isPackKey(k) ? PACKS[k].name : k);

/**
 * GST tax invoices for employer plans, event-host purchases (Pro, Event Boost) and funding-data downloads.
 *
 * - Seller details and SAC codes are set in Admin → Billing → Invoice settings, falling back to the server settings
 *   they replaced (see lib/billing/seller.ts). Until the required ones are set, invoices are off rather than wrong.
 * - The seller details are frozen onto the payment with the bill-to details, so changing the settings later never
 *   changes an invoice that was already issued.
 * - Numbers are sequential per Indian financial year: UTPL/26-27/0001 for invoices, UTCN/26-27/0001 for credit
 *   notes. GST allows an invoice number at most 16 characters (Rule 46), which is why the year is two digits each.
 * - The bill-to details are frozen onto the payment when its number is assigned (right after payment), so later
 *   profile edits never change an issued invoice.
 * - Place of supply is the buyer's state (from their GSTIN when registered): CGST + SGST within the seller's state,
 *   IGST otherwise. Unregistered buyers get the same tax invoice without a GSTIN.
 */

export { GSTIN_RE } from '@/lib/billing/details';
export { GST_STATES } from '@/lib/billing/gst-states';

export type InvoiceTable = 'employer' | 'organizer' | 'funding';

/** True once the seller details a tax invoice needs are set. */
export const invoicesEnabled = async () => (await loadSeller()) !== null;

/** Financial year label for a date, in IST: 2026-27 for 1 Apr 2026 to 31 Mar 2027. */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 36e5);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Credit notes run in their own series: the first two letters of the prefix plus CN (UTPL → UTCN). */
export function creditNotePrefix(prefix: string): string {
  const cn = `${prefix.slice(0, 2)}CN`;
  return cn === prefix ? `${prefix.slice(0, 2)}CR` : cn;
}

/**
 * UTPL/26-27/0001 (invoice) or UTCN/26-27/0001 (credit note). `fy` is the full label, "2026-27".
 * 15 characters with a 4-letter prefix, 16 from number 10,000 on: inside GST's 16-character limit up to 99,999 a year.
 */
export const formatInvoiceNumber = (prefix: string, kind: 'INV' | 'CN', fy: string, n: number) =>
  `${kind === 'INV' ? prefix : creditNotePrefix(prefix)}/${fy.slice(2)}/${String(n).padStart(4, '0')}`;

/** Indian-system amount in words, e.g. "Two Thousand Three Hundred Fifty Eight Rupees and Eighty Two Paise Only". */
export function amountInWords(paise: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${two(n % 100)}` : ''}` : two(n));
  const words = (n: number): string => {
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `${words(r)} Rupees${p ? ` and ${two(p)} Paise` : ''} Only`;
}

/** What's frozen on the payment: the billing profile plus the account it belonged to. */
export interface BillingSnapshot extends BillingProfile { accountName: string; accountEmail: string; seller?: FrozenSeller }

interface PaymentRow {
  id: string; status: string; amountPaise: number; gstPaise: number; totalPaise: number; invoiceNumber: string | null;
  billingSnapshot: unknown; razorpayOrderId: string; razorpayPaymentId: string | null; paidAt: Date | null; createdAt: Date;
  periodStart: Date | null; periodEnd: Date | null; invoiceEmailedAt: Date | null;
  refundedAt: Date | null; refundAmountPaise: number | null; refundId: string | null; refundReason: string | null;
  creditNoteNumber: string | null; creditNoteAt: Date | null; creditNoteEmailedAt: Date | null;
}

const ACCOUNT_SELECT = { email: true, ...BILLING_SELECT } as const;

async function loadPayment(table: InvoiceTable, id: string) {
  if (table === 'funding') {
    // No account: the bill-to entered at checkout stands in for a billing profile.
    const p = await prisma.fundingDataPurchase.findUnique({ where: { id } });
    if (!p) return null;
    const details = (p.billingDetails ?? {}) as Partial<Record<keyof typeof ACCOUNT_SELECT, unknown>>;
    const name = typeof details.billingName === 'string' && details.billingName ? details.billingName : p.email;
    return {
      pay: { ...p, periodStart: p.paidAt, periodEnd: p.accessExpiresAt } as PaymentRow, ownerId: p.email, accountName: name,
      account: { ...details, email: p.email } as Partial<Record<keyof BillingProfile, unknown>> & { email: string },
      description: `Udyaibase funding dataset (${fundingPackName(p.pack)}), digital download`,
    };
  }
  if (table === 'employer') {
    const p = await prisma.jobBoardPayment.findUnique({ where: { id }, include: { Employer: { select: { id: true, companyName: true, ...ACCOUNT_SELECT } } } });
    if (!p) return null;
    return {
      pay: p as PaymentRow, ownerId: p.employerId, accountName: p.Employer.companyName, account: p.Employer,
      description: `Udyaibase Jobs ${planSoldName(p.plan)} plan${p.cycle === 'ANNUAL' ? ' (annual)' : ''}${await discountNote(p.razorpayOrderId, p.amountPaise)}`,
    };
  }
  const p = await prisma.organizerPayment.findUnique({ where: { id }, include: { organizer: { select: { id: true, name: true, company: true, ...ACCOUNT_SELECT } } } });
  if (!p) return null;
  let description = `Udyaibase Events Pro plan${p.cycle === 'ANNUAL' ? ' (annual)' : ''}${p.kind === 'PRO' ? await discountNote(p.razorpayOrderId, p.amountPaise) : ''}`;
  if (p.kind === 'BOOST') {
    const ev = p.eventId ? await prisma.event.findUnique({ where: { id: p.eventId }, select: { title: true } }) : null;
    description = `Event Boost${ev ? `: ${ev.title}` : ''}`;
  }
  if (p.kind === 'CERTIFICATES') {
    const ev = p.eventId ? await prisma.event.findUnique({ where: { id: p.eventId }, select: { title: true } }) : null;
    description = `Event certificates${ev ? `: ${ev.title}` : ''}`;
  }
  return { pay: p as PaymentRow, ownerId: p.organizerId, accountName: p.organizer.company || p.organizer.name, account: p.organizer, description };
}

type PaymentPatch = { invoiceNumber?: string; billingSnapshot?: object; invoiceEmailedAt?: Date; creditNoteNumber?: string; creditNoteAt?: Date; creditNoteEmailedAt?: Date };
async function setPaymentFields(table: InvoiceTable, id: string, data: PaymentPatch, tx = prisma) {
  if (table === 'employer') await tx.jobBoardPayment.update({ where: { id }, data });
  else if (table === 'funding') await tx.fundingDataPurchase.update({ where: { id }, data });
  else await tx.organizerPayment.update({ where: { id }, data });
}

/** The numbering columns of a payment, read inside the numbering transaction. */
const PAYMENT_TABLES: Record<InvoiceTable, string> = { employer: 'JobBoardPayment', organizer: 'OrganizerPayment', funding: 'FundingDataPurchase' };

/**
 * Lock the payment row for the rest of the transaction. Numbering reads "has a number?" then takes the next one;
 * without the lock, the post-payment email and the daily retry could both take a number for the same payment and
 * leave a gap in the series (GST invoice numbers must be consecutive).
 */
async function lockPaymentRow(tx: typeof prisma, table: InvoiceTable, id: string) {
  // Table name from the fixed map above; the id is a bound parameter.
  await tx.$queryRawUnsafe(`SELECT id FROM "${PAYMENT_TABLES[table]}" WHERE id = $1 FOR UPDATE`, id);
}

async function numbersOf(tx: typeof prisma, table: InvoiceTable, id: string) {
  const select = { invoiceNumber: true, billingSnapshot: true, creditNoteNumber: true } as const;
  if (table === 'employer') return tx.jobBoardPayment.findUnique({ where: { id }, select });
  if (table === 'funding') return tx.fundingDataPurchase.findUnique({ where: { id }, select });
  return tx.organizerPayment.findUnique({ where: { id }, select });
}

export interface IssuedInvoice {
  table: InvoiceTable; paymentId: string; ownerId: string; number: string; issuedOn: Date; snapshot: BillingSnapshot;
  /** The seller as printed on this invoice (frozen when it was issued). */
  seller: FrozenSeller;
  description: string; periodStart: Date | null; periodEnd: Date | null;
  amountPaise: number; gstPaise: number; totalPaise: number;
  paidVia: 'online' | 'manual'; reference: string | null;
  emailedAt: Date | null; refundedPaise: number;
}

/**
 * Give a paid payment its invoice number and freeze its bill-to details (both once, together).
 * Returns null when invoices are off or the payment isn't invoiceable (failed, or free).
 */
export async function issueInvoice(table: InvoiceTable, paymentId: string): Promise<IssuedInvoice | null> {
  const seller = await loadSeller();
  if (!seller) return null;
  const loaded = await loadPayment(table, paymentId);
  if (!loaded || loaded.pay.status !== 'SUCCESS' || loaded.pay.totalPaise <= 0) return null;
  let { pay } = loaded;
  // Fully refunded before an invoice was ever issued: no invoice and so no credit note either.
  if (!pay.invoiceNumber && pay.refundedAt && (pay.refundAmountPaise ?? 0) >= pay.totalPaise) return null;

  // An invoice issued before seller details were frozen gets them frozen now, the first time it is read again.
  if (!pay.invoiceNumber || !pay.billingSnapshot || !frozenSellerOf(pay.billingSnapshot)) {
    const issuedOn = pay.paidAt ?? pay.createdAt;
    const frozen = freezeSeller(seller, table);
    const fresh: BillingSnapshot = { ...profileFromRow(loaded.account, loaded.account.email), accountName: loaded.accountName, accountEmail: loaded.account.email, seller: frozen };
    await prisma.$transaction(async (tx) => {
      await lockPaymentRow(tx as typeof prisma, table, pay.id);
      const current = await numbersOf(tx as typeof prisma, table, pay.id);
      let number = current?.invoiceNumber ?? null;
      if (!number) {
        const fy = financialYear(issuedOn);
        const counter = await tx.invoiceCounter.upsert({ where: { fy: `INV:${fy}` }, create: { fy: `INV:${fy}`, next: 2 }, update: { next: { increment: 1 } } });
        number = formatInvoiceNumber(seller.prefix, 'INV', fy, counter.next - 1);
      }
      const kept = current?.billingSnapshot as object | null | undefined;
      const snapshot = kept ? (frozenSellerOf(kept) ? kept : { ...kept, seller: frozen }) : fresh;
      await setPaymentFields(table, pay.id, { invoiceNumber: number, billingSnapshot: snapshot }, tx as typeof prisma);
    });
    const reloaded = await loadPayment(table, paymentId);
    if (!reloaded) return null;
    pay = reloaded.pay;
  }

  const manual = pay.razorpayOrderId.startsWith('manual_');
  return {
    table, paymentId: pay.id, ownerId: loaded.ownerId, number: pay.invoiceNumber!, issuedOn: pay.paidAt ?? pay.createdAt,
    snapshot: pay.billingSnapshot as BillingSnapshot, seller: frozenSellerOf(pay.billingSnapshot) ?? freezeSeller(seller, table), description: loaded.description,
    periodStart: pay.periodStart, periodEnd: pay.periodEnd,
    amountPaise: pay.amountPaise, gstPaise: pay.gstPaise, totalPaise: pay.totalPaise,
    paidVia: manual ? 'manual' : 'online', reference: manual ? pay.razorpayOrderId.replace(/^manual_/, '') : pay.razorpayPaymentId,
    emailedAt: pay.invoiceEmailedAt, refundedPaise: pay.refundAmountPaise ?? 0,
  };
}

// ── PDF ───────────────────────────────────────────────────────────────────────

const rs = (paise: number) => `Rs ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim();
const dateIn = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Tax split for an invoice: CGST + SGST within the seller's state, IGST otherwise. */
export function taxSplit(gstPaise: number, buyerState: string, sellerState: string) {
  if (buyerState === sellerState) {
    const cgst = Math.floor(gstPaise / 2);
    return { intra: true as const, cgst, sgst: gstPaise - cgst, igst: 0 };
  }
  return { intra: false as const, cgst: 0, sgst: 0, igst: gstPaise };
}

/** One GST document (invoice or credit note); both share this layout. */
interface TaxDocument {
  title: 'TAX INVOICE' | 'CREDIT NOTE';
  copyLabel: string;
  meta: [string, string][];
  seller: FrozenSeller;
  snapshot: BillingSnapshot;
  lineDescription: string;
  amountPaise: number;
  gstPaise: number;
  totalPaise: number;
  totalLabel: string;
  paymentHeading: string;
  paymentLine: string;
}

function placeOfSupply(b: BillingSnapshot, sellerState: string) {
  return b.billingGstin && GSTIN_RE.test(b.billingGstin) ? b.billingGstin.slice(0, 2) : b.billingState && GST_STATES[b.billingState] ? b.billingState : sellerState;
}

async function renderTaxDocument(d: TaxDocument): Promise<Uint8Array> {
  const seller = d.seller;
  const b = d.snapshot;
  const tax = taxSplit(d.gstPaise, placeOfSupply(b, seller.stateCode), seller.stateCode);

  const doc = await PDFDocument.create();
  doc.setTitle(`${d.title === 'TAX INVOICE' ? 'Tax Invoice' : 'Credit Note'} ${d.meta[0]?.[1] ?? ''}`);
  doc.setAuthor(seller.name);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.09, 0.15), muted = rgb(0.42, 0.45, 0.5), line = rgb(0.85, 0.86, 0.88), brand = rgb(0.647, 0.059, 0.082);
  const L = 48, R = 547;
  let y = 794;

  const text = (p: PDFPage, s: string, x: number, size = 9.5, f: PDFFont = font, color = ink) => p.drawText(ascii(s), { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 9.5, f: PDFFont = font, color = ink) => { const v = ascii(s); page.drawText(v, { x: xRight - f.widthOfTextAtSize(v, size), y, size, font: f, color }); };
  const rule = (yy: number, x1 = L, x2 = R) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: line });
  const block = (lines: string[], x: number, width: number, size = 9.5, f: PDFFont = font, color = ink) => {
    for (const raw of lines) {
      let cur = '';
      for (const word of ascii(raw).split(' ')) {
        const next = cur ? `${cur} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && cur) { text(page, cur, x, size, f, color); y -= size + 3.5; cur = word; } else cur = next;
      }
      if (cur) { text(page, cur, x, size, f, color); y -= size + 3.5; }
    }
  };

  // Header
  text(page, d.title, L, 18, bold, brand);
  right(d.copyLabel, R, 8.5, font, muted);
  y -= 20;
  text(page, seller.name, L, 11, bold);
  y -= 26;

  // Document details (right) and seller (left)
  const top = y;
  for (const [k, v] of d.meta) { text(page, k, 330, 8.5, font, muted); right(v, R, 9, bold); y -= 14; }
  const metaBottom = y;
  y = top;
  text(page, 'FROM', L, 8, bold, muted); y -= 13;
  block([seller.address], L, 250, 9, font, muted);
  text(page, `GSTIN ${seller.gstin}  |  PAN ${seller.pan}`, L, 9); y -= 12.5;
  // Supplier's state with its code, the way GST returns ask for it.
  if (GST_STATES[seller.stateCode]) { text(page, `State: ${GST_STATES[seller.stateCode]}, Code: ${seller.stateCode}`, L, 9); y -= 12.5; }
  if (seller.cin) { text(page, `CIN ${seller.cin}`, L, 9); y -= 12.5; }
  // A company's bills carry its phone, email and website next to its CIN and registered office (Companies Act, s. 12).
  block([[seller.email, seller.phone, seller.website].filter(Boolean).join('  |  ')], L, 250, 9, font, muted);
  y = Math.min(y, metaBottom) - 16;

  // Bill to
  rule(y + 8);
  text(page, 'BILL TO', L, 8, bold, muted); y -= 13;
  text(page, b.billingName || b.accountName, L, 10.5, bold); y -= 14;
  block(formatBillingAddress(b), L, 300, 9, font, ink);
  // State name and code of the recipient, required on invoices to unregistered buyers of Rs 50,000 or more.
  if (b.billingState && GST_STATES[b.billingState]) { text(page, `State: ${GST_STATES[b.billingState]}, Code: ${b.billingState}`, L, 9); y -= 12.5; }
  text(page, b.billingGstin ? `GSTIN ${b.billingGstin}  |  PAN ${panFromGstin(b.billingGstin)}` : b.billingType === 'INDIVIDUAL' ? 'Individual (unregistered)' : 'Unregistered (no GSTIN)', L, 9); y -= 12.5;
  text(page, b.billingEmail || b.accountEmail, L, 9, font, muted); y -= 22;

  // Line item
  const cols = { desc: L, sac: 305, qty: 365, rate: 450, amt: R };
  page.drawRectangle({ x: L, y: y - 5, width: R - L, height: 18, color: rgb(0.96, 0.96, 0.97) });
  text(page, 'DESCRIPTION', cols.desc + 6, 8, bold, muted); text(page, 'SAC', cols.sac, 8, bold, muted); text(page, 'QTY', cols.qty, 8, bold, muted);
  right('RATE', cols.rate, 8, bold, muted); right('TAXABLE VALUE', cols.amt - 6, 8, bold, muted);
  y -= 22;
  const rowTop = y;
  block([d.lineDescription], cols.desc + 6, 245, 9.5, font, ink);
  const rowBottom = y;
  y = rowTop;
  text(page, seller.sac, cols.sac, 9.5); text(page, '1', cols.qty, 9.5); right(rs(d.amountPaise), cols.rate, 9.5); right(rs(d.amountPaise), cols.amt - 6, 9.5);
  y = Math.min(y, rowBottom) - 8;
  rule(y + 6);

  // Totals
  y -= 12;
  const total = (k: string, v: string, strong = false) => { text(page, k, 340, strong ? 10.5 : 9.5, strong ? bold : font); right(v, R - 6, strong ? 10.5 : 9.5, strong ? bold : font); y -= strong ? 18 : 15; };
  total('Taxable value', rs(d.amountPaise));
  if (tax.intra) { total('CGST @ 9%', rs(tax.cgst)); total('SGST @ 9%', rs(tax.sgst)); } else total('IGST @ 18%', rs(tax.igst));
  rule(y + 9, 340, R);
  y -= 4;
  total(d.totalLabel, rs(d.totalPaise), true);
  block([`Amount in words: ${amountInWords(d.totalPaise)}`], L, R - L, 9, font, muted);
  y -= 8;

  // Payment / refund
  rule(y + 6);
  y -= 10;
  text(page, d.paymentHeading, L, 8, bold, muted); y -= 13;
  block([d.paymentLine], L, R - L, 9, font, ink);
  y -= 22;

  // Signature and footer
  right(`For ${seller.name}`, R, 9, bold); y -= 30;
  right('Authorised signatory', R, 8.5, font, muted);
  // The note set in Admin → Billing → Invoice settings: up to two lines above the footer rule.
  if (seller.footerNote) { y = 97; block([seller.footerNote], L, R - L, 8.5, font, muted); }
  y = 60;
  rule(y + 12);
  text(page, `This is a computer-generated ${d.title === 'TAX INVOICE' ? 'invoice' : 'credit note'} and does not require a physical signature.`, L, 8, font, muted); y -= 11;
  text(page, `Questions? ${seller.email}`, L, 8, font, muted);
  return doc.save();
}

export async function buildInvoicePdf(inv: IssuedInvoice, opts: { copyLabel?: string } = {}): Promise<Uint8Array> {
  const seller = inv.seller;
  const pos = placeOfSupply(inv.snapshot, seller.stateCode);
  return renderTaxDocument({
    title: 'TAX INVOICE',
    copyLabel: opts.copyLabel ?? 'Original for recipient',
    seller,
    meta: [
      ['Invoice number', inv.number],
      ['Invoice date', dateIn(inv.issuedOn)],
      ...(inv.periodStart && inv.periodEnd ? [['Service period', `${dateIn(inv.periodStart)} - ${dateIn(inv.periodEnd)}`] as [string, string]] : []),
      ['Place of supply', `${GST_STATES[pos] ?? ''} (${pos})`],
      ['Reverse charge', 'No'],
      ...(inv.snapshot.billingPoNumber ? [['PO / reference', inv.snapshot.billingPoNumber] as [string, string]] : []),
    ],
    snapshot: inv.snapshot,
    lineDescription: inv.description,
    amountPaise: inv.amountPaise, gstPaise: inv.gstPaise, totalPaise: inv.totalPaise,
    totalLabel: 'Total',
    paymentHeading: 'PAYMENT',
    paymentLine: inv.paidVia === 'online'
      ? `Paid in full on ${dateIn(inv.issuedOn)} via Razorpay${inv.reference ? `  |  Payment ID ${inv.reference}` : ''}`
      : `Paid in full on ${dateIn(inv.issuedOn)} by bank transfer / UPI${inv.reference ? `  |  Reference ${inv.reference}` : ''}`,
  });
}

// ── Preview and freezing (Admin → Billing → Invoice settings) ───────────────────

const SAMPLE_LINES: Record<InvoiceProduct, string> = {
  employer: 'Udyaibase Jobs Growth plan',
  organizer: 'Udyaibase Events Pro plan',
  funding: 'Udyaibase funding dataset (Full dataset), digital download',
};

/** A sample invoice with made-up buyer and amounts, so the admin can see settings before saving them. */
export async function buildSampleInvoicePdf(seller: Seller, product: InvoiceProduct, now = new Date()): Promise<Uint8Array> {
  const frozen = freezeSeller(seller, product);
  const snapshot: BillingSnapshot = {
    billingType: 'GST', billingName: 'Sample Customer Private Limited', billingGstin: null,
    billingAddressLine1: '12 Example Road', billingAddressLine2: null, billingCity: 'Bengaluru', billingState: '29', billingPostalCode: '560001',
    billingCountry: 'India', billingPoNumber: null, billingEmail: 'accounts@example.com', billingCcEmails: [],
    accountName: 'Sample Customer', accountEmail: 'accounts@example.com', seller: frozen,
  };
  return buildInvoicePdf({
    table: product, paymentId: 'sample', ownerId: 'sample', number: formatInvoiceNumber(seller.prefix, 'INV', financialYear(now), 0),
    issuedOn: now, snapshot, seller: frozen, description: SAMPLE_LINES[product],
    periodStart: product === 'funding' ? null : now, periodEnd: product === 'funding' ? null : new Date(now.getTime() + 30 * 864e5),
    amountPaise: 199900, gstPaise: 35982, totalPaise: 235882,
    paidVia: 'online', reference: 'pay_SAMPLE000000', emailedAt: null, refundedPaise: 0,
  }, { copyLabel: 'SAMPLE - not a valid invoice' });
}

/**
 * Freeze today's seller details onto every issued invoice that has none yet. The admin runs this just before
 * saving new invoice settings, so invoices already sent keep the details they were sent with.
 */
export async function freezeIssuedInvoiceSellers(): Promise<{ frozen: number } | { error: 'invoices_off' }> {
  const seller = await loadSeller();
  if (!seller) return { error: 'invoices_off' };
  let frozen = 0;
  for (const table of ['employer', 'organizer', 'funding'] as const) {
    // Table name from the fixed map above; the seller is a bound parameter.
    frozen += await prisma.$executeRawUnsafe(
      `UPDATE "${PAYMENT_TABLES[table]}" SET "billingSnapshot" = "billingSnapshot" || jsonb_build_object('seller', $1::jsonb)
       WHERE "invoiceNumber" IS NOT NULL AND "billingSnapshot" IS NOT NULL AND jsonb_typeof("billingSnapshot") = 'object'
         AND NOT jsonb_exists("billingSnapshot", 'seller')`,
      JSON.stringify(freezeSeller(seller, table)),
    );
  }
  return { frozen };
}

export const invoiceFilename = (number: string) => `${number.replace(/\//g, '-')}.pdf`;

// ── Email ─────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

/** Email the invoice PDF to the invoice email (+ CC). `force` re-sends one already sent ("Email again"). */
export async function emailInvoice(table: InvoiceTable, paymentId: string, opts: { force?: boolean } = {}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const inv = await issueInvoice(table, paymentId);
  if (!inv) return { ok: false, error: (await invoicesEnabled()) ? 'This payment has no invoice.' : 'Invoices aren’t available yet.' };
  if (inv.emailedAt && !opts.force) return { ok: true, to: inv.snapshot.billingEmail ?? inv.snapshot.accountEmail };
  // Send to the current invoice contacts (they may have changed since payment); the invoice itself stays frozen.
  const loaded = await loadPayment(table, paymentId);
  const current = loaded ? profileFromRow(loaded.account, loaded.account.email) : inv.snapshot;
  const to = current.billingEmail || inv.snapshot.accountEmail;
  const cc = current.billingCcEmails.filter((e) => e !== to).slice(0, 3);
  const pdf = await buildInvoicePdf(inv);
  const billingUrl = `${SITE}/${table === 'employer' ? 'employer' : 'organizer'}/billing`;
  const r = await sendEmail({
    to, cc,
    replyTo: inv.seller.email,
    subject: `Invoice ${inv.number} from Udyaibase`,
    type: 'billing_invoice',
    attachments: [{ filename: invoiceFilename(inv.number), content: Buffer.from(pdf), contentType: 'application/pdf' }],
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">Your invoice from Udyaibase</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Thanks for your payment. Your GST tax invoice is attached.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px">
<tr><td style="padding:6px 0;color:#6b7280">Invoice</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(inv.number)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">For</td><td style="padding:6px 0;text-align:right">${esc(inv.description)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Billed to</td><td style="padding:6px 0;text-align:right">${esc(inv.snapshot.billingName || inv.snapshot.accountName)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #e5e7eb">Total paid (incl. GST)</td><td style="padding:6px 0;text-align:right;font-weight:600;border-top:1px solid #e5e7eb">₹${(inv.totalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
</table>
${table === 'funding'
    ? '<p style="margin:12px 0 0;font-size:13px;color:#6b7280">Keep this email for your records. Reply to it with any questions.</p></div>'
    : `<p style="margin:0 0 8px"><a href="${billingUrl}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">View billing</a></p>
<p style="margin:12px 0 0;font-size:13px;color:#6b7280">You can download all your invoices from the billing page. Reply to this email with any questions.</p></div>`}`,
  });
  if (!r.success) return { ok: false, error: 'Couldn’t send the email. Try again in a minute.' };
  await setPaymentFields(table, paymentId, { invoiceEmailedAt: new Date() });
  return { ok: true, to };
}

/** Issue and email invoices for paid payments that don't have one yet (cron; also covers manual admin grants). */
export async function sendPendingInvoices(limit = 50): Promise<number> {
  if (!(await invoicesEnabled())) return 0;
  const since = new Date(Date.now() - 45 * 864e5); // don't surprise people with very old invoices on first enable
  const where = { status: 'SUCCESS' as const, totalPaise: { gt: 0 }, invoiceEmailedAt: null, paidAt: { gte: since } };
  const [emp, org, fund] = await Promise.all([
    prisma.jobBoardPayment.findMany({ where, select: { id: true }, take: limit }),
    prisma.organizerPayment.findMany({ where, select: { id: true }, take: limit }),
    prisma.fundingDataPurchase.findMany({ where, select: { id: true }, take: limit }),
  ]);
  let sent = 0;
  for (const p of emp) if ((await emailInvoice('employer', p.id)).ok) sent++;
  for (const p of org) if ((await emailInvoice('organizer', p.id)).ok) sent++;
  for (const p of fund) if ((await emailInvoice('funding', p.id)).ok) sent++;
  return sent;
}

// ── Credit notes (refunds) ────────────────────────────────────────────────────

export interface IssuedCreditNote {
  invoice: IssuedInvoice;
  number: string;
  issuedOn: Date;
  /** Refunded amount split like the original: taxable value + GST = refund total. */
  amountPaise: number;
  gstPaise: number;
  totalPaise: number;
  reason: string | null;
  refundRef: string | null;
  emailedAt: Date | null;
}

/** Split a GST-inclusive refund in the same proportion as the original payment. */
export function refundSplit(refundTotalPaise: number, original: { amountPaise: number; totalPaise: number }) {
  const amountPaise = Math.round((refundTotalPaise * original.amountPaise) / Math.max(1, original.totalPaise));
  return { amountPaise, gstPaise: refundTotalPaise - amountPaise, totalPaise: refundTotalPaise };
}

/**
 * Credit note for a refunded payment: numbered once (UTCN/<FY of refund>/0001), against the payment's invoice
 * (issued first if needed). Returns null when invoices are off or there's no refund (or nothing was invoiced).
 */
export async function issueCreditNote(table: InvoiceTable, paymentId: string): Promise<IssuedCreditNote | null> {
  const seller = await loadSeller();
  if (!seller) return null;
  const loaded = await loadPayment(table, paymentId);
  if (!loaded?.pay.refundedAt || !loaded.pay.refundAmountPaise) return null;
  const invoice = await issueInvoice(table, paymentId);
  if (!invoice) return null;

  let pay = loaded.pay;
  if (!pay.creditNoteNumber) {
    const refundedAt = pay.refundedAt!;
    await prisma.$transaction(async (tx) => {
      await lockPaymentRow(tx as typeof prisma, table, pay.id);
      const current = await numbersOf(tx as typeof prisma, table, pay.id);
      if (current?.creditNoteNumber) return;
      const fy = financialYear(refundedAt);
      const counter = await tx.invoiceCounter.upsert({ where: { fy: `CN:${fy}` }, create: { fy: `CN:${fy}`, next: 2 }, update: { next: { increment: 1 } } });
      await setPaymentFields(table, pay.id, { creditNoteNumber: formatInvoiceNumber(seller.prefix, 'CN', fy, counter.next - 1), creditNoteAt: refundedAt }, tx as typeof prisma);
    });
    const reloaded = await loadPayment(table, paymentId);
    if (!reloaded) return null;
    pay = reloaded.pay;
  }

  return {
    invoice,
    number: pay.creditNoteNumber!,
    issuedOn: pay.creditNoteAt ?? pay.refundedAt!,
    ...refundSplit(pay.refundAmountPaise!, pay),
    reason: pay.refundReason,
    refundRef: pay.refundId,
    emailedAt: pay.creditNoteEmailedAt,
  };
}

export async function buildCreditNotePdf(cn: IssuedCreditNote): Promise<Uint8Array> {
  // A credit note carries the seller details of the invoice it reverses.
  const seller = cn.invoice.seller;
  const pos = placeOfSupply(cn.invoice.snapshot, seller.stateCode);
  return renderTaxDocument({
    title: 'CREDIT NOTE',
    copyLabel: 'Original for recipient',
    seller,
    meta: [
      ['Credit note number', cn.number],
      ['Credit note date', dateIn(cn.issuedOn)],
      ['Against invoice', cn.invoice.number],
      ['Invoice date', dateIn(cn.invoice.issuedOn)],
      ['Place of supply', `${GST_STATES[pos] ?? ''} (${pos})`],
      ['Reverse charge', 'No'],
    ],
    snapshot: cn.invoice.snapshot,
    lineDescription: `Refund${cn.totalPaise < cn.invoice.totalPaise ? ' (partial)' : ''}: ${cn.invoice.description}${cn.reason ? ` - ${cn.reason}` : ''}`,
    amountPaise: cn.amountPaise, gstPaise: cn.gstPaise, totalPaise: cn.totalPaise,
    totalLabel: 'Total credited',
    paymentHeading: 'REFUND',
    paymentLine: cn.refundRef
      ? `Refunded on ${dateIn(cn.issuedOn)} to the original payment method via Razorpay  |  Refund ID ${cn.refundRef}`
      : `Refunded on ${dateIn(cn.issuedOn)} by bank transfer`,
  });
}

/** Email the credit note to the invoice email (+ CC). `force` re-sends one already sent. */
export async function emailCreditNote(table: InvoiceTable, paymentId: string, opts: { force?: boolean } = {}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const cn = await issueCreditNote(table, paymentId);
  if (!cn) return { ok: false, error: (await invoicesEnabled()) ? 'This payment has no credit note.' : 'Invoices aren’t available yet.' };
  if (cn.emailedAt && !opts.force) return { ok: true, to: cn.invoice.snapshot.billingEmail ?? cn.invoice.snapshot.accountEmail };
  const loaded = await loadPayment(table, paymentId);
  const current = loaded ? profileFromRow(loaded.account, loaded.account.email) : cn.invoice.snapshot;
  const to = current.billingEmail || cn.invoice.snapshot.accountEmail;
  const cc = current.billingCcEmails.filter((e) => e !== to).slice(0, 3);
  const pdf = await buildCreditNotePdf(cn);
  const r = await sendEmail({
    to, cc,
    replyTo: cn.invoice.seller.email,
    subject: `Credit note ${cn.number} from Udyaibase`,
    type: 'billing_credit_note',
    attachments: [{ filename: invoiceFilename(cn.number), content: Buffer.from(pdf), contentType: 'application/pdf' }],
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">Your credit note from Udyaibase</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">We’ve refunded ₹${(cn.totalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} against invoice ${esc(cn.invoice.number)}. The GST credit note is attached for your records.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">
<tr><td style="padding:6px 0;color:#6b7280">Credit note</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(cn.number)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Against invoice</td><td style="padding:6px 0;text-align:right">${esc(cn.invoice.number)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #e5e7eb">Amount credited (incl. GST)</td><td style="padding:6px 0;text-align:right;font-weight:600;border-top:1px solid #e5e7eb">₹${(cn.totalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
</table>
<p style="margin:0;font-size:13px;color:#6b7280">${cn.refundRef ? 'Card and UPI refunds usually show within 5–7 working days.' : 'We’ll transfer the amount to the account you paid from.'} Reply to this email with any questions.</p></div>`,
  });
  if (!r.success) return { ok: false, error: 'Couldn’t send the email. Try again in a minute.' };
  await setPaymentFields(table, paymentId, { creditNoteEmailedAt: new Date() });
  return { ok: true, to };
}

/** Issue and email credit notes for refunds that don't have one yet (cron safety net for the admin trigger). */
export async function sendPendingCreditNotes(limit = 50): Promise<number> {
  if (!(await invoicesEnabled())) return 0;
  const where = { refundedAt: { not: null }, refundAmountPaise: { gt: 0 }, creditNoteEmailedAt: null } as const;
  const [emp, org, fund] = await Promise.all([
    prisma.jobBoardPayment.findMany({ where, select: { id: true }, take: limit }),
    prisma.organizerPayment.findMany({ where, select: { id: true }, take: limit }),
    prisma.fundingDataPurchase.findMany({ where, select: { id: true }, take: limit }),
  ]);
  let sent = 0;
  for (const p of emp) if ((await emailCreditNote('employer', p.id)).ok) sent++;
  for (const p of org) if ((await emailCreditNote('organizer', p.id)).ok) sent++;
  for (const p of fund) if ((await emailCreditNote('funding', p.id)).ok) sent++;
  return sent;
}
