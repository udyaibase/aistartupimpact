import { getBilling } from '@/lib/billing/request';
import { refundedPayments } from '@/lib/billing/summary';
import { fyLabel, fyStart, monthStart } from '@/lib/billing/periods';
import PaymentsTable from '@/components/billing/PaymentsTable';
import { Stat } from '@/components/billing/parts';
import { count, rupees } from '@/components/billing/format';

export default async function BillingRefundsPage() {
  const { rows, now } = await getBilling();
  const refunds = refundedPayments(rows);
  const amount = (list: typeof refunds) => list.reduce((n, r) => n + (r.refundAmountPaise ?? 0), 0);
  const inMonth = refunds.filter((r) => new Date(r.refundedAt!) >= monthStart(now));
  const inFy = refunds.filter((r) => new Date(r.refundedAt!) >= fyStart(now));
  const noNote = refunds.filter((r) => r.stream !== 'ADS' && !r.creditNoteNumber);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Refunded this month" value={rupees(amount(inMonth))} hint={`${count(inMonth.length)} refunds`} />
        <Stat label={`Refunded ${fyLabel(now)}`} value={rupees(amount(inFy))} hint={`${count(inFy.length)} refunds`} />
        <Stat label="Refunded, all time" value={rupees(amount(refunds))} hint={`${count(refunds.length)} refunds`} />
        <Stat label="Without a credit note" value={count(noNote.length)} hint="GST credit note still to be issued" tone={noNote.length > 0 ? 'warn' : undefined} />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">Amounts include GST, as returned to the customer. To refund a payment, find it under All payments or its stream. Advertising refunds are recorded in Ad payments and have no credit note here.</p>
      <PaymentsTable rows={refunds} view="refunds" tableId="billing-refunds" title="Refunds" />
    </div>
  );
}
