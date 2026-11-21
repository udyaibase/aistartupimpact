/**
 * A milestone's amount, the way people in India say it: ₹25 lakh, ₹2.5 crore, $2.5M. It was shown as
 * "INR 2,500,000". One place, used by the founder's list and both public pages.
 */
const trim = (n: number) => {
  const fixed = n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed; // "2.50" → "2.5", but "250" stays "250"
};

export function milestoneAmount(amount: unknown, currency: string | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  const code = (currency || 'INR').toUpperCase();
  if (code === 'INR') {
    if (n >= 1e7) return `₹${trim(n / 1e7)} crore`;
    if (n >= 1e5) return `₹${trim(n / 1e5)} lakh`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  }
  const symbol = code === 'USD' ? '$' : code === 'EUR' ? '€' : `${code} `;
  if (n >= 1e9) return `${symbol}${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${symbol}${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${symbol}${trim(n / 1e3)}K`;
  return `${symbol}${Math.round(n).toLocaleString('en-US')}`;
}

/** "USER_MILESTONE" → "User milestone". */
export function milestoneTypeLabel(type: string): string {
  const words = type.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
