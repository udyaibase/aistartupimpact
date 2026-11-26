import { describe, expect, it } from 'vitest';
import { fyMonths, fyName, fyYearOf, fyYearsWithData, reconcile, transactionLines, TXN_HEAD } from '@/lib/billing/reconcile';
import type { LedgerRow } from '@/lib/billing/types';

let n = 0;
function row(over: Partial<LedgerRow>): LedgerRow {
  n += 1;
  return {
    id: `p${n}`, stream: 'EMPLOYER', product: 'Employer plan · Pro', code: 'PRO', cycle: 'MONTHLY', accountId: 'a', account: 'Acme', email: 'a@acme.test',
    amountPaise: 100000, gstPaise: 18000, totalPaise: 118000, netPaise: 100000, state: 'PAID', online: true, foundingPrice: false,
    invoiceNumber: null, razorpayId: null, createdAt: '2026-05-10T06:00:00Z', paidAt: '2026-05-10T06:00:00Z', failedAt: null,
    periodStart: null, periodEnd: null, refundedAt: null, refundAmountPaise: null, refundReason: null, refundedBy: null, creditNoteNumber: null, ...over,
  };
}

describe('billing reconciliation', () => {
  it('names financial years and lists April to March', () => {
    expect(fyName(2026)).toBe('FY 2026-27');
    expect(fyYearOf(new Date('2026-03-31T18:00:00Z'))).toBe(2025); // 23:30 IST, 31 March
    expect(fyYearOf(new Date('2026-03-31T19:00:00Z'))).toBe(2026); // 00:30 IST, 1 April
    const months = fyMonths(2026);
    expect(months[0].key).toBe('2026-04');
    expect(months[11].key).toBe('2027-03');
  });

  it('splits what customers paid into taxable value and GST', () => {
    const r = reconcile([row({}), row({ stream: 'HOST', amountPaise: 50000, gstPaise: 9000, totalPaise: 59000 })], 2026);
    const may = r.months.find((m) => m.key === '2026-05')!;
    expect(may).toMatchObject({ payments: 2, collected: 177000, gst: 27000, taxable: 150000, netTaxable: 150000, netGst: 27000, netCollected: 177000 });
    expect(r.total.collected).toBe(177000);
    expect(r.byStream.EMPLOYER).toMatchObject({ collected: 118000, gst: 18000 });
    expect(r.byStream.HOST).toMatchObject({ collected: 59000, gst: 9000 });
  });

  it('counts a refund in the month it was made, and reverses the same share of GST', () => {
    const r = reconcile([row({ state: 'PART_REFUNDED', refundedAt: '2026-07-02T06:00:00Z', refundAmountPaise: 59000 })], 2026);
    const may = r.months.find((m) => m.key === '2026-05')!;
    const july = r.months.find((m) => m.key === '2026-07')!;
    expect(may).toMatchObject({ collected: 118000, refunded: 0, netGst: 18000 });
    expect(july).toMatchObject({ payments: 0, refundCount: 1, refunded: 59000, gstReversed: 9000, netTaxable: -50000, netGst: -9000, netCollected: -59000 });
    expect(r.total).toMatchObject({ collected: 118000, gst: 18000, refunded: 59000, gstReversed: 9000, netTaxable: 50000, netGst: 9000, netCollected: 59000 });
  });

  it('leaves out failed payments and other financial years', () => {
    const r = reconcile([
      row({ state: 'FAILED', paidAt: null, netPaise: 0 }),
      row({ paidAt: '2026-02-10T06:00:00Z' }),                                  // FY 2025-26
      row({ paidAt: '2026-03-31T19:00:00Z' }),                                  // 1 April IST → FY 2026-27
    ], 2026);
    expect(r.total.payments).toBe(1);
    expect(r.months[0]).toMatchObject({ key: '2026-04', payments: 1 });
  });

  it('carries a refund of an earlier year into the year it was refunded', () => {
    const r = reconcile([row({ paidAt: '2026-02-10T06:00:00Z', state: 'REFUNDED', refundedAt: '2026-04-05T06:00:00Z', refundAmountPaise: 118000 })], 2026);
    expect(r.total).toMatchObject({ payments: 0, collected: 0, refunded: 118000, gstReversed: 18000, netGst: -18000 });
  });

  it('never refunds more than was paid', () => {
    const r = reconcile([row({ state: 'REFUNDED', refundedAt: '2026-05-11T06:00:00Z', refundAmountPaise: 999999 })], 2026);
    expect(r.total).toMatchObject({ refunded: 118000, gstReversed: 18000, netCollected: 0, netGst: 0, netTaxable: 0 });
  });

  it('lists the financial years that have data, newest first', () => {
    const years = fyYearsWithData([row({ paidAt: '2025-06-01T06:00:00Z' }), row({})], new Date('2026-11-26T04:30:00Z'));
    expect(years).toEqual([2026, 2025]);
  });

  it('exports one line per sale and per refund, and the lines add up to the monthly figures', () => {
    const rows = [
      row({ invoiceNumber: 'INV-1' }),
      row({ invoiceNumber: 'INV-2', state: 'PART_REFUNDED', refundedAt: '2026-07-02T06:00:00Z', refundAmountPaise: 59000, creditNoteNumber: 'CN-1', refundReason: 'Charged twice' }),
      row({ state: 'FAILED', paidAt: null, netPaise: 0 }),
      row({ paidAt: '2026-02-10T06:00:00Z' }), // another financial year
    ];
    const lines = transactionLines(rows, 2026);
    expect(lines.map((l) => l.cells[2])).toEqual(['Sale', 'Sale', 'Refund']);
    expect(lines.every((l) => l.cells.length === TXN_HEAD.length)).toBe(true);

    const refund = lines[2];
    expect(refund.month).toBe('2026-07');
    expect(refund.cells[8]).toBe('CN-1');                 // document no. is the credit note
    expect(refund.cells.slice(9, 12)).toEqual([-500, -90, -590]);
    expect(refund.cells[16]).toBe('Against invoice INV-2. Charged twice');

    const recon = reconcile(rows, 2026);
    const col = (i: number) => Math.round(lines.reduce((n, l) => n + (l.cells[i] as number), 0) * 100);
    expect(col(9)).toBe(recon.total.netTaxable);
    expect(col(10)).toBe(recon.total.netGst);
    expect(col(11)).toBe(recon.total.netCollected);
  });

  it('dates export lines in India time', () => {
    const lines = transactionLines([row({ paidAt: '2026-05-31T19:00:00Z' })], 2026); // 00:30 IST on 1 June
    expect(lines[0].cells[0]).toBe('2026-06-01');
    expect(lines[0].month).toBe('2026-06');
  });

  it('works out what Razorpay kept and what it should pay out', () => {
    const r = reconcile([
      row({ razorpayId: 'pay_1', gatewayFeePaise: 2360, gatewayTaxPaise: 360 }),                         // fee ₹20 + ₹3.60 GST
      row({ razorpayId: 'pay_2', gatewayFeePaise: 2360, gatewayTaxPaise: 360, state: 'PART_REFUNDED', refundedAt: '2026-05-20T06:00:00Z', refundAmountPaise: 59000 }),
      row({ razorpayId: 'pay_3' }),                                                                       // fee not fetched yet
      row({ online: false, razorpayId: null }),                                                           // paid by invoice
    ], 2026);
    expect(r.total).toMatchObject({
      onlineCollected: 354000, onlineRefunded: 59000, gatewayFee: 4000, gatewayGst: 720, feeMissing: 1, offlineNet: 118000,
      settlement: 354000 - 59000 - 4000 - 720,
    });
    // Both halves describe the same money: Razorpay side + outside Razorpay + what Razorpay kept = net kept from customers.
    expect(r.total.settlement + r.total.offlineNet + r.total.gatewayFee + r.total.gatewayGst).toBe(r.total.netCollected);
  });

  it('puts the Razorpay fee on the sale line of the export and leaves refund lines empty', () => {
    const lines = transactionLines([row({ razorpayId: 'pay_1', gatewayFeePaise: 2360, gatewayTaxPaise: 360, state: 'PART_REFUNDED', refundedAt: '2026-05-20T06:00:00Z', refundAmountPaise: 59000 })], 2026);
    expect(lines[0].cells.slice(14, 16)).toEqual([20, 3.6]);
    expect(lines[1].cells.slice(14, 16)).toEqual(['', '']);
  });

  it('subtracts an offline refund from money received outside Razorpay', () => {
    const r = reconcile([row({ online: false, state: 'REFUNDED', refundedAt: '2026-05-12T06:00:00Z', refundAmountPaise: 118000 })], 2026);
    expect(r.total).toMatchObject({ offlineNet: 0, onlineCollected: 0, onlineRefunded: 0, settlement: 0 });
  });
});
