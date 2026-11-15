/** Common perks offered as tick boxes on the job form; employers can add their own as well. */
export const PERK_OPTIONS = [
  'Health insurance',
  'Flexible hours',
  'Remote-friendly',
  'Learning budget',
  'Paid time off',
  'Parental leave',
  'Performance bonus',
  'Laptop and equipment',
  'Home-office allowance',
  'Meals and snacks',
  'Wellness and gym',
  'Mental health support',
  'Team offsites',
  'Relocation support',
  'Transport allowance',
  'Visa sponsorship',
] as const;

export const MAX_PERKS = 20;
export const MAX_PERK_LENGTH = 60;

/** Trim, collapse spaces, drop empties and case-insensitive duplicates, keep at most MAX_PERKS. */
export function cleanPerks(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const perk = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_PERK_LENGTH);
    const key = perk.toLowerCase();
    if (!perk || seen.has(key)) continue;
    seen.add(key);
    out.push(perk);
    if (out.length >= MAX_PERKS) break;
  }
  return out;
}
