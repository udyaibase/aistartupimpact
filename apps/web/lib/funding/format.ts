/**
 * Display helpers for funding rounds. Amounts are stored in the smallest unit: amountUsd in cents,
 * amountInr in paise. (The round page used to divide by a million as if they were whole units.)
 */

/** "SERIES_D" → "Series D", "PRE_SEED" → "Pre-Seed", "SEED" → "Seed". */
export function roundLabel(roundType: string | null | undefined): string {
  const t = String(roundType || '').trim();
  if (!t) return 'Funding';
  return t
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => (w.length === 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/^Pre /, 'Pre-')
    .replace(/\bIpo\b/, 'IPO');
}

const trim1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** $65M, $1.2B, $500K from cents; null when unknown. */
export function usdLabel(cents: number | string | bigint | null | undefined): string | null {
  const dollars = Number(cents ?? 0) / 100;
  if (!dollars || !Number.isFinite(dollars)) return null;
  if (dollars >= 1e9) return `$${trim1(dollars / 1e9)}B`;
  if (dollars >= 1e6) return `$${trim1(dollars / 1e6)}M`;
  if (dollars >= 1e3) return `$${Math.round(dollars / 1e3)}K`;
  return `$${Math.round(dollars)}`;
}

/** ₹540 Cr, ₹75 L from paise; null when unknown. */
export function inrLabel(paise: number | string | bigint | null | undefined): string | null {
  const rupees = Number(paise ?? 0) / 100;
  if (!rupees || !Number.isFinite(rupees)) return null;
  const crore = rupees / 1e7;
  if (crore >= 1) return `₹${crore >= 100 ? Math.round(crore).toLocaleString('en-IN') : trim1(crore)} Cr`;
  const lakh = rupees / 1e5;
  if (lakh >= 1) return `₹${trim1(lakh)} L`;
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}

/** The headline amount for a round: dollars when recorded, otherwise rupees. */
export function roundAmount(r: { amountUsd?: unknown; amountInr?: unknown }): string | null {
  return usdLabel(r.amountUsd as number) ?? inrLabel(r.amountInr as number);
}

/** "Qure.ai raises $65M Series D" / "Qure.ai raises Series D funding" (no amount on record). */
export function roundHeadline(r: { startupName: string; roundType?: string | null; amountUsd?: unknown; amountInr?: unknown }): string {
  const amount = roundAmount(r);
  const label = roundLabel(r.roundType);
  return amount ? `${r.startupName.trim()} raises ${amount} ${label}` : `${r.startupName.trim()} raises ${label} funding`;
}
