/** What a ticket costs, in words, from the event's ticket prices (in paise). No tickets set up means free. */
export function eventPriceLabel(pricesPaise: Array<number | null | undefined>): { free: boolean; label: string } {
  const prices = pricesPaise.filter((p): p is number => typeof p === 'number' && p >= 0);
  const paid = prices.filter((p) => p > 0);
  if (paid.length === 0) return { free: true, label: 'Free' };
  const from = `₹${(Math.min(...paid) / 100).toLocaleString('en-IN')}`;
  if (paid.length < prices.length) return { free: false, label: `Free or from ${from}` };
  return { free: false, label: paid.length > 1 && Math.min(...paid) !== Math.max(...paid) ? `From ${from}` : from };
}
